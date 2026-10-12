"""Source-preserving forms for named NPCs and premade player characters."""
import json
import re
from functools import lru_cache
from pathlib import Path
from . import document
from .map_editor import _state


@lru_cache(maxsize=1)
def definitions():
    rows = json.loads((Path(__file__).resolve().parent.parent/'docs/wiki.json').read_text(encoding='utf-8'))
    result = {}
    for section in ('npcs', 'premadeCharacters'):
        row = next(r for r in rows if r.get('section') == section)
        schema = row['schema']
        record = schema.get('codomain', schema.get('of'))
        fields = {}
        for part in record.get('parts', []):
            fields.update(part.get('fields', {}))
        result[section] = fields
    return result


def _type(schema):
    if isinstance(schema, str): return schema
    kind = schema.get('_type')
    if kind == 'record': return 'object'
    if kind == 'union' and all(isinstance(v.get('value'), str) for v in schema.get('of', [])): return 'string'
    return kind


def _value_type(value):
    if isinstance(value, document.Number): return 'number'
    return {str:'string', bool:'boolean', dict:'object', list:'array', type(None):'null'}[type(value)]


def _records(text):
    state, base = _state(text)
    warnings, records = [], []
    for section, kind, expected in [('npcs','npc',dict), ('premadeCharacters','premade',list)]:
        collection = state.get(section, expected())
        if not isinstance(collection, expected):
            warnings.append(f'{section} must be an {"object" if expected is dict else "array"}. Edit its JSON to repair it.')
            continue
        items = collection.items() if expected is dict else enumerate(collection)
        for key, value in items:
            path = base+[section,key]
            if not isinstance(value, dict):
                warnings.append(f'{section}[{key!r}] is not a character object.')
                continue
            records.append((section, kind, key, value, path))
    return records, warnings


def inspect(text):
    records, warnings = _records(text)
    output = []
    for section, kind, key, value, path in records:
        fields = []
        schemas = definitions()[section]
        for field in dict.fromkeys([*schemas, *value]):
            schema = schemas.get(field)
            present = field in value
            field_type = _type(schema) if schema is not None else _value_type(value[field])
            raw = document.section(text,path+[field]) if present else None
            # All numeric and container values travel as exact JSON text.
            plain = value.get(field)
            descriptor = {'key':field, 'label':re.sub(r'([a-z])([A-Z])',r'\1 \2',field).capitalize(),
                          'type':field_type, 'present':present, 'raw':raw,
                          'value':plain if isinstance(plain,(str,bool)) else None,
                          'readOnly':kind == 'npc' and field == 'name'}
            if isinstance(schema,dict) and schema.get('_type')=='union':
                descriptor['options']=[v['value'] for v in schema.get('of',[]) if 'value' in v]
            fields.append(descriptor)
        name = value.get('properName') or value.get('name') or (key if kind=='npc' else f'Premade character {key+1}')
        portrait = value.get('portraitUrl','')
        summary = value.get('basicInfo',value.get('description',''))
        output.append({'id':json.dumps(path,ensure_ascii=True), 'path':path, 'kind':kind,'key':key,
                       'name':name if isinstance(name,str) else str(key),
                       'portrait':portrait if isinstance(portrait,str) else '',
                       'summary':summary if isinstance(summary,str) else '',
                       'fields':fields,'raw':document.section(text,path)})
    return {'characters':output, 'warnings':warnings}


def _check_value(schema, value, field):
    kind = _type(schema)
    if kind != _value_type(value):
        raise ValueError(f'{field} must be a {kind}.')
    if isinstance(schema,dict):
        if schema.get('_type')=='union' and value not in [v.get('value') for v in schema['of']]:
            raise ValueError(f'Choose a documented value for {field}.')
        if kind=='array' and schema.get('of')=='string' and any(not isinstance(v,str) for v in value):
            raise ValueError(f'{field} must contain only strings.')
        if schema.get('_type')=='record' and schema.get('codomain')=='number' and any(not isinstance(v,document.Number) for v in value.values()):
            raise ValueError(f'{field} must contain numeric values.')


def edit(text, path, changes, expected=None):
    records, _ = _records(text)
    match = next((record for record in records if record[4] == path),None)
    if not match: raise ValueError('Choose an existing NPC or premade character.')
    section, kind, key, value, path = match
    if expected is not None and document.section(text,path)!=expected:
        raise ValueError('This character changed while its form was open. Reopen the form before applying.')
    if not isinstance(changes,dict) or not changes: raise ValueError('Provide character fields to change.')
    schemas = definitions()[section]
    replacements = []
    for field, proposed in changes.items():
        if field not in schemas and field not in value: raise ValueError(f'Unknown character field: {field}. Use the JSON editor to add custom fields.')
        raw = proposed['raw'] if isinstance(proposed,dict) and set(proposed)=={'raw'} else json.dumps(proposed,ensure_ascii=True,allow_nan=False)
        parsed = document.parse(raw)
        if field in schemas: _check_value(schemas[field],parsed,field)
        if kind=='npc' and field=='name' and parsed!=key:
            raise ValueError('NPC name must match its record key. Edit properName for its display name.')
        replacements.append((field,raw))
    for field, raw in replacements:
        text = document.replace(text,path+[field],raw) if field in value else document.mutate(text,path,'add',field,raw)
    return text


def create(text, kind, name):
    state, base = _state(text)
    if not isinstance(name,str) or not name.strip() or len(name)>120: raise ValueError('Character name must be 1–120 characters.')
    name=name.strip()
    section = {'npc':'npcs','premade':'premadeCharacters'}.get(kind)
    if not section: raise ValueError('Choose NPC or premade character.')
    expected = dict if kind=='npc' else list
    collection = state.get(section,expected())
    if not isinstance(collection,expected): raise ValueError(f'Repair {section} before adding a character.')
    if kind=='npc' and name in collection: raise ValueError('An NPC with this record key already exists.')
    if section not in state: text=document.mutate(text,base,'add',section,'{}' if kind=='npc' else '[]')
    record={'name':name,'basicInfo':''} if kind=='npc' else {'name':name,'description':''}
    key=name if kind=='npc' else len(collection)
    text=document.mutate(text,base+[section],'add' if kind=='npc' else 'append',key,json.dumps(record,ensure_ascii=True))
    return {'text':text,'path':base+[section,key]}
