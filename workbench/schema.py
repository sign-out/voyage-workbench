"""Advisory checks from the bundled community wiki schema, never remote acceptance."""
from decimal import Decimal, InvalidOperation
from functools import lru_cache
import json
from pathlib import Path
from .document import Number, parse, inspect, section

@lru_cache(maxsize=1)
def references():
    return json.loads((Path(__file__).resolve().parent.parent/'docs/wiki.json').read_text(encoding='utf-8'))


def check(value, schema, path='$', limit=100):
    issues=[]
    def issue(message):
        if len(issues)<limit:issues.append(path+': '+message)
    if isinstance(schema,str):
        valid={'string':isinstance(value,str),'number':isinstance(value,Number),'boolean':type(value)is bool,'null':value is None,'unknown':True,'any':True}.get(schema,True)
        if not valid:issue('expected '+schema)
        return issues
    if not isinstance(schema,dict):return issues
    kind=schema.get('_type')
    if kind=='literal':
        literal=schema.get('value');actual=value
        if isinstance(value,Number):
            try:actual=Decimal(value.lexeme)
            except InvalidOperation:return [path+': invalid number']
        if type(actual)is bool and type(literal)is not bool or actual!=literal:issue('expected '+json.dumps(literal))
    elif kind in ('required','partial'):
        if not isinstance(value,dict):issue('expected object')
        else:
            for key,child in schema.get('fields',{}).items():
                if len(issues)>=limit:break
                if key in value:issues.extend(check(value[key],child,path+'['+json.dumps(key)+']',limit-len(issues)))
                elif kind=='required':issue('missing required field '+key)
    elif kind=='record':
        if not isinstance(value,dict):issue('expected keyed object')
        else:
            for key,child in value.items():
                if len(issues)>=limit:break
                issues.extend(check(child,schema.get('codomain'),path+'['+json.dumps(key)+']',limit-len(issues)))
    elif kind=='array':
        if not isinstance(value,list):issue('expected array')
        else:
            for i,child in enumerate(value):
                if len(issues)>=limit:break
                issues.extend(check(child,schema.get('of'),path+'['+str(i)+']',limit-len(issues)))
    elif kind=='intersection':
        for part in schema.get('parts',[]):
            if len(issues)>=limit:break
            issues.extend(check(value,part,path,limit-len(issues)))
    elif kind=='union':
        options=schema.get('of',[])
        if options and all(check(value,part,path,1) for part in options):issue('value does not match any documented type or enum')
    elif kind=='refined':
        issues.extend(check(value,schema.get('of'),path,limit))
        if isinstance(value,Number):
            try:
                number=Decimal(value.lexeme)
                if schema.get('integer') and number!=number.to_integral_value():issue('expected integer')
                if 'min' in schema and number<Decimal(str(schema['min'])):issue('below documented minimum '+str(schema['min']))
                if 'max' in schema and number>Decimal(str(schema['max'])):issue('above documented maximum '+str(schema['max']))
            except InvalidOperation:issue('could not check numeric constraints')
    return issues[:limit]


def validate(text, profile=None):
    info=inspect(text)
    if info.get('gameStatePath') is None or info['errors']:return []
    state=parse(section(text,info['gameStatePath']))
    issues=[]
    refs = references() if profile is None else profile.get('sections', [])
    if profile is not None and 'root' in profile:
        issues.extend(check(state, profile['root']))
    for ref in refs:
        key=ref.get('section')
        if key in state and ref.get('schema'):
            issues.extend(check(state[key],ref['schema'],'$.'+key,max(0,100-len(issues))))
        if len(issues)>=100:break
    label = 'Cached community schema' if profile is None else profile.get('sourceLabel', 'Selected community schema')
    warnings=[label+': '+item for item in issues]
    if profile is not None and not profile.get('observedRequirements', False):
        return warnings
    # A current Voyage draft validation response reports this GameState field
    # as required. Keep it advisory: the bundled references may lag the API,
    # and only the connected validator can establish remote acceptance.
    settings=state.get('successLevelSettings')
    if 'successLevelSettings' not in state:
        warnings.append('Observed Voyage draft requirement: $.successLevelSettings is missing; restore firstSuccessfulTierId and tiers from a known-good world before remote validation.')
    elif not isinstance(settings,dict):
        warnings.append('Observed Voyage draft requirement: $.successLevelSettings must be an object.')
    else:
        if not isinstance(settings.get('firstSuccessfulTierId'),str):
            warnings.append('Observed Voyage draft requirement: $.successLevelSettings.firstSuccessfulTierId must be a string.')
        tiers=settings.get('tiers')
        if not isinstance(tiers,list):
            warnings.append('Observed Voyage draft requirement: $.successLevelSettings.tiers must be an array.')
        else:
            for index,tier in enumerate(tiers[:20]):
                path=f'$.successLevelSettings.tiers[{index}]'
                if not isinstance(tier,dict):
                    warnings.append('Observed Voyage draft requirement: '+path+' must be an object.')
                    continue
                for field in ('id','name','prompt'):
                    if not isinstance(tier.get(field),str):
                        warnings.append('Observed Voyage draft requirement: '+path+'.'+field+' must be a string.')
                for field in ('minScore','maxScore'):
                    if field not in tier or (tier[field] is not None and not isinstance(tier[field],Number)):
                        warnings.append('Observed Voyage draft requirement: '+path+'.'+field+' must be a number or null.')
    return warnings
