import {relationshipRules} from './relationships';
export type Path = (string | number)[];
export interface Node {kind:'object'|'array'|'string'|'number'|'boolean'|'null'; start:number; end:number; value?:string|boolean|null; children:{key:string|number; keyStart:number; node:Node}[]}
export function parse(source:string):Node {
  if(typeof source!=='string')throw new Error('Document must be JSON text.');
  const surrogate=/[\uD800-\uDFFF]/g;let pair:RegExpExecArray|null;
  while((pair=surrogate.exec(source))){const i=pair.index,unit=source.charCodeAt(i),next=source.charCodeAt(i+1);if(unit>0xdbff||!(next>=0xdc00&&next<=0xdfff))throw new Error('Raw surrogate in JSON text');surrogate.lastIndex=i+2;}
  let p=0, count=0;
  const number=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g;
  const fail=(message:string):never=>{throw new Error(message+' at character '+p);};
  const ws=()=>{while(p<source.length){const c=source.charCodeAt(p);if(c!==32&&c!==9&&c!==10&&c!==13)break;p++;}};
  function string():string {
    const start=p++;let end=p;
    while((end=source.indexOf('"',end))>=0){let escapes=0;for(let i=end-1;i>=start&&source.charAt(i)==='\\';i--)escapes++;if(escapes%2===0){p=end+1;try{return JSON.parse(source.slice(start,p));}catch{fail('Invalid string');}}end++;}
    return fail('Unterminated string');
  }
  function node(depth:number):Node {
    if(depth>128)fail('JSON nesting exceeds 128'); if(++count>1000000)fail('Document has too many values');
    ws();const start=p,c=source.charAt(p),children:Node['children']=[];
    let n:Node={kind:'null',start,end:p,children};
    if(c==='{'||c==='['){
      const object=c==='{',end=object?'}':']', seen:Record<string,boolean>=Object.create(null);n.kind=object?'object':'array';p++;ws();
      if(source.charAt(p)!==end){while(true){ws();const keyStart=p;let key:string|number=children.length;
        if(object){if(source.charAt(p)!=='"')fail('Expected a quoted key');key=string();if(seen[key])fail('Duplicate key '+key);seen[key]=true;ws();if(source.charAt(p++)!==':')fail('Expected colon');}
        children.push({key,keyStart,node:node(depth+1)});ws();if(source.charAt(p)===end)break;if(source.charAt(p++)!==',')fail('Expected comma or closing delimiter');
      }}p++;
    }else if(c==='"'){n.kind='string';n.value=string();}
    else {number.lastIndex=p;const match=c==='-'||(c>='0'&&c<='9')?number.exec(source):null;
      if(match&&match.index===p){n.kind='number';p+=match[0].length;}
      else if(source.slice(p,p+4)==='true'){n.kind='boolean';n.value=true;p+=4;}
      else if(source.slice(p,p+5)==='false'){n.kind='boolean';n.value=false;p+=5;}
      else if(source.slice(p,p+4)==='null'){n.value=null;p+=4;}
      else fail('Expected a JSON value');
    }n.end=p;return n;
  }
  const root=node(0);ws();if(p!==source.length)fail('Unexpected trailing content');return root;
}
export function at(root:Node,path:Path):Node {
  if(!Array.isArray(path))throw new Error('A path must be an array of keys or indices.');
  let n=root;
  path.forEach(key=>{const item=n.children.filter(c=>c.key===key)[0];if(!item)throw new Error('Path not found: '+label(path));n=item.node;});return n;
}
export function label(path:Path):string {return '$'+path.map(p=>typeof p==='number'?'['+p+']':'['+JSON.stringify(p)+']').join('');}
export function read(source:string,path:Path):string {const n=at(parse(source),path);return source.slice(n.start,n.end);}
export function edit(source:string,path:Path,replacement:string):string {const n=at(parse(source),path),r=parse(replacement);return source.slice(0,n.start)+replacement.slice(r.start,r.end)+source.slice(n.end);}
export function insert(source:string,path:Path,key:string|number,replacement:string):string {
  const n=at(parse(source),path),r=parse(replacement),raw=replacement.slice(r.start,r.end);
  if(n.kind!=='object'&&n.kind!=='array')throw new Error('Select an object or array before adding a value.');
  if(n.kind==='object'&&(typeof key!=='string'||n.children.some(c=>c.key===key)))throw new Error('Choose a new, exact field name.');
  const addition=(n.children.length?',':'')+(n.kind==='object'?JSON.stringify(key)+': ':'')+raw;
  return source.slice(0,n.end-1)+addition+source.slice(n.end-1);
}
export function remove(source:string,path:Path):string {
  if(!path.length)throw new Error('The document root cannot be removed.');
  const parent=at(parse(source),path.slice(0,-1)),i=parent.children.findIndex(c=>c.key===path[path.length-1]);
  if(i<0)throw new Error('Path no longer exists.');
  const child=parent.children[i],start=i===0?child.keyStart:parent.children[i-1].node.end;
  const end=i===0&&parent.children.length>1?parent.children[1].keyStart:child.node.end;
  return source.slice(0,start)+source.slice(end);
}
export function describe(source:string,path:Path=[]){const n=at(parse(source),path);return {kind:n.kind,source:source.slice(n.start,n.end),children:n.children.map(c=>({key:c.key,kind:c.node.kind,
  preview:c.node.kind==='object'||c.node.kind==='array'?c.node.children.length+' entries':c.node.kind==='string'?String(c.node.value).slice(0,180):source.slice(c.node.start,Math.min(c.node.end,c.node.start+180))}))};}
export function statePath(root:Node):Path {
  const exists=(p:Path)=>{try{return at(root,p);}catch{return null;}};
  for(const p of [['data','world','initialGameState'],['world','initialGameState'],['initialGameState']] as Path[])if(exists(p))return p;
  return [];
}
export const packageReadOnlyFields=['shortId','loadStatus','degradedReason','canSafelySave'];
export const gameStateReadOnlyFields=['heroesVersion','compatibilityRevision'];
export function voyageManagedPaths(source:string):Path[]{
 const base=statePath(parse(source));
 return [...(base.length?packageReadOnlyFields.map(field=>base.slice(0,-1).concat(field)):[]),...gameStateReadOnlyFields.map(field=>base.concat(field))];
}
export function preserveVoyageFields(current:string,incoming:string){
 const original=parse(current),changed=parse(incoming),beforeBase=statePath(original),afterBase=statePath(changed);
 if(at(changed,afterBase).kind!=='object')throw new Error('A linked Voyage import must keep an object GameState. Import other JSON as a separate local project.');
 let source=incoming;const protectedPaths:Path[]=[];
 for(const path of voyageManagedPaths(current)){
  const stateField=JSON.stringify(path.slice(0,-1))===JSON.stringify(beforeBase),field=path[path.length-1];
  const target=(stateField?afterBase:afterBase.slice(0,-1)).concat(field);
  const value=(text:string,node:Node,selected:Path)=>{try{const entry=at(node,selected);return text.slice(entry.start,entry.end);}catch{return undefined;}};
  const previous=value(current,original,path),next=value(source,parse(source),target);
  if(previous===next)continue;
  protectedPaths.push(target);
  if(previous===undefined){if(next!==undefined)source=remove(source,target);}
  else if(next!==undefined)source=edit(source,target,previous);
  else source=insert(source,target.slice(0,-1),field,previous);
 }
 return {source,protectedPaths};
}
export function explorerDescribe(source:string,requested:Path=[]){
 const root=parse(source),rootPath=statePath(root);
 const ancestor=requested.length<rootPath.length&&requested.every((key,index)=>rootPath[index]===key);
 const path=ancestor?rootPath:requested;
 const packagePath=rootPath.slice(0,-1);
 const readOnly=voyageManagedPaths(source).some(managed=>managed.length<=path.length&&managed.every((key,index)=>key===path[index]));
 const fields=rootPath.length?at(root,packagePath).children.filter(child=>child.key!=='initialGameState').map(child=>({key:child.key,source:source.slice(child.node.start,child.node.end)})):[];
 return {...describe(source,path),path,rootPath,readOnly,packageFields:fields};
}
export function explorerSearch(source:string,query:string,limit=60){
 const root=parse(source),base=statePath(root),content=at(root,base);
 return search(source.slice(content.start,content.end),query,limit).map(result=>({...result,path:base.concat(result.path)}));
}
export function assertPackageMetadataUnchanged(before:string,after:string){
 const original=parse(before),changed=parse(after);
 for(const path of voyageManagedPaths(before)){
  const field=path[path.length-1];
  const get=(root:Node)=>{try{return at(root,path);}catch{return null;}};
  const previous=get(original),next=get(changed);
  if((previous===null)!==(next===null)||previous&&next&&(previous.kind!==next.kind||(['object','array','number'].includes(previous.kind)?before.slice(previous.start,previous.end)!==after.slice(next.start,next.end):previous.value!==next.value)))throw new Error('Package metadata '+field+' is read only. Refresh it from Voyage or import as a separate local project; do not edit it as world content.');
 }
}
export interface Change {path:Path;kind:'added'|'removed'|'changed'|'order';before:string;after:string}
export interface ChangeChoice {path:Path;kind:Change['kind']}
export function alignImport(current:string,incoming:string,protectVoyageMetadata=false){
 const currentPath=statePath(parse(current)),incomingPath=statePath(parse(incoming));
 let aligned={source:incoming,note:''};
 if(currentPath.length&&!incomingPath.length)aligned={source:edit(current,currentPath,incoming),note:'Imported GameState is reviewed inside the existing world envelope. API metadata and world identity are preserved.'};
 else if(!currentPath.length&&incomingPath.length)aligned={source:read(incoming,incomingPath),note:'Imported world envelope is reviewed as GameState to match this local document. Its metadata is not substituted for the linked API world.'};
 else if(currentPath.length&&incomingPath.length)aligned={source:edit(current,currentPath.slice(0,-1),read(incoming,incomingPath.slice(0,-1))),note:JSON.stringify(currentPath)!==JSON.stringify(incomingPath)?'Imported envelope is aligned to the current document wrapper.':''};
 if(protectVoyageMetadata){const preserved=preserveVoyageFields(current,aligned.source);aligned.source=preserved.source;aligned.note+=(aligned.note?' ':'')+(preserved.protectedPaths.length?'Protected Voyage fields retained from the linked world: '+preserved.protectedPaths.map(label).join(', ')+'. ':'')+'Voyage identity and schema-version fields are protected. Import as a separate project to use another world identity or schema version.';}
 return aligned;
}
export function selectChanges(before:string,after:string,rejected:ChangeChoice[]=[]):string {
 if(!rejected.length)return after;
 const oldRoot=parse(before),newRoot=parse(after);
 const choices:Record<string,boolean>=Object.create(null),prefixes:Record<string,boolean>=Object.create(null);
 rejected.forEach(choice=>{choices[JSON.stringify([choice.kind,choice.path])]=true;for(let length=0;length<=choice.path.length;length++)prefixes[JSON.stringify(choice.path.slice(0,length))]=true;});
 const rejects=(path:Path,kind:Change['kind'])=>!!choices[JSON.stringify([kind,path])];
 const relevant=(path:Path)=>!!prefixes[JSON.stringify(path)];
 function merge(oldNode:Node|undefined,newNode:Node|undefined,path:Path):string|undefined{
  if(!oldNode)return rejects(path,'added')?undefined:after.slice(newNode!.start,newNode!.end);
  if(!newNode)return rejects(path,'removed')?before.slice(oldNode.start,oldNode.end):undefined;
  if(rejects(path,'changed'))return before.slice(oldNode.start,oldNode.end);
  if(!relevant(path)||oldNode.kind!=='object'||newNode.kind!=='object')return after.slice(newNode.start,newNode.end);
  const oldKeys=oldNode.children.map(child=>child.key),newKeys=newNode.children.map(child=>child.key);
  const oldMap:Record<string,Node>=Object.create(null),newMap:Record<string,Node>=Object.create(null),values:Record<string,string>=Object.create(null);
  oldNode.children.forEach(child=>oldMap[String(child.key)]=child.node);newNode.children.forEach(child=>newMap[String(child.key)]=child.node);
  oldKeys.concat(newKeys.filter(key=>!oldMap[String(key)])).forEach(key=>{const value=merge(oldMap[String(key)],newMap[String(key)],path.concat(key));if(value!==undefined)values[String(key)]=value;});
  let keys=(rejects(path,'order')?oldKeys.concat(newKeys.filter(key=>!oldMap[String(key)])):newKeys).filter(key=>values[String(key)]!==undefined);
  oldKeys.forEach((key,index)=>{if(values[String(key)]===undefined||keys.includes(key))return;const next=oldKeys.slice(index+1).find(next=>keys.includes(next));keys.splice(next===undefined?keys.length:keys.indexOf(next),0,key);});
  return '{'+keys.map(key=>JSON.stringify(key)+':'+values[String(key)]).join(',')+'}';
 }
 return merge(oldRoot,newRoot,[])!;
}
export function diff(before:string,after:string,limit=2000,offset=0,match?:ChangeChoice){
  const a=parse(before),b=parse(after),changes:Change[]=[];let total=0;
  function equal(x:Node,y:Node):boolean{
    if(x.kind!==y.kind)return false;if(before.slice(x.start,x.end)===after.slice(y.start,y.end))return true;
    if(x.kind==='number')return false;
    if(x.kind==='string'||x.kind==='boolean'||x.kind==='null')return x.value===y.value;
    return x.children.length===y.children.length&&x.children.every((c,i)=>c.key===y.children[i].key&&equal(c.node,y.children[i].node));
  }
  function add(path:Path,kind:Change['kind'],x?:Node,y?:Node){total++;if(total>offset&&changes.length<limit&&(!match||(match.kind===kind&&JSON.stringify(match.path)===JSON.stringify(path))))changes.push({path,kind,before:x?before.slice(x.start,x.end):'',after:y?after.slice(y.start,y.end):''});}
  function walk(x:Node,y:Node,path:Path){
    if(equal(x,y))return;
    if(x.kind==='object'&&y.kind==='object'){
      const oldKeys=x.children.map(c=>c.key),newKeys=y.children.map(c=>c.key);
      const oldMap:Record<string,Node>=Object.create(null),newMap:Record<string,Node>=Object.create(null);x.children.forEach(c=>oldMap[String(c.key)]=c.node);y.children.forEach(c=>newMap[String(c.key)]=c.node);
      const commonOld=oldKeys.filter(k=>!!newMap[String(k)]),commonNew=newKeys.filter(k=>!!oldMap[String(k)]);
      if(JSON.stringify(commonOld)!==JSON.stringify(commonNew))add(path,'order',x,y);
      x.children.forEach(c=>{const next=newMap[String(c.key)];if(next)walk(c.node,next,path.concat(c.key));else add(path.concat(c.key),'removed',c.node);});
      y.children.forEach(c=>{if(!oldMap[String(c.key)])add(path.concat(c.key),'added',undefined,c.node);});
    }else add(path,'changed',x,y);
  }walk(a,b,[]);return {changes,total,truncated:total>offset+limit,offset};
}
export interface Issue {level:'error'|'warning';path:Path;message:string}
export function validate(source:string,references:any[]=[]):Issue[]{
  const issues:Issue[]=[];let root:Node;
  try{root=parse(source);}catch(e){return [{level:'error',path:[],message:String((e as Error).message)}];}
  const prefix=statePath(root),world=at(root,prefix);
  if(world.kind!=='object')return [{level:'error',path:prefix,message:'A world must be a JSON object.'}];
  function check(n:Node,s:any,path:Path,depth=0){
    if(issues.length>=200||depth>128||!s)return;
    if(typeof s==='string'){if(['unknown','any'].indexOf(s)<0&&s!==n.kind)issues.push({level:'error',path,message:'Expected '+s+', found '+n.kind+'.'});return;}
    if(s._type==='literal'){const actual=n.kind==='number'?source.slice(n.start,n.end):n.value;if(String(actual)!==String(s.value))issues.push({level:'error',path,message:'Expected '+JSON.stringify(s.value)+'.'});}
    else if(s._type==='required'||s._type==='partial'){
      if(n.kind!=='object'){issues.push({level:'error',path,message:'Expected an object.'});return;}
      Object.keys(s.fields||{}).forEach(k=>{const c=n.children.filter(v=>v.key===k)[0];if(c)check(c.node,s.fields[k],path.concat(k),depth+1);else if(s._type==='required')issues.push({level:'error',path:path.concat(k),message:'Required field is missing.'});});
    }else if(s._type==='record'){if(n.kind!=='object')issues.push({level:'error',path,message:'Expected an object.'});else n.children.forEach(c=>check(c.node,s.codomain,path.concat(c.key),depth+1));}
    else if(s._type==='array'){if(n.kind!=='array')issues.push({level:'error',path,message:'Expected an array.'});else n.children.forEach(c=>check(c.node,s.of,path.concat(c.key),depth+1));}
    else if(s._type==='refined')check(n,s.of,path,depth+1);
    else if(s._type==='intersection')(s.parts||[]).forEach((part:any)=>check(n,part,path,depth+1));
    else if(s._type==='union'){
      const start=issues.length;let best:Issue[]|null=null;
      for(const part of s.of||[]){issues.length=start;check(n,part,path,depth+1);const added=issues.slice(start);if(!added.length){issues.length=start;return;}if(!best||added.length<best.length)best=added;}
      issues.length=start;if(best)issues.push.apply(issues,best);
    }
  }
  const unique:Record<string,boolean>=Object.create(null);
  references.forEach(ref=>{if(!ref.schema||unique[ref.section])return;const entry=world.children.filter(c=>c.key===ref.section)[0];if(entry){unique[ref.section]=true;check(entry.node,ref.schema,prefix.concat(ref.section));}});
  const rules=relationshipRules.map(rule=>[rule.section,rule.field,rule.target]);
  rules.forEach(rule=>{try{const records=at(world,[rule[0]]),targets=at(world,[rule[2]]);records.children.forEach(c=>{try{const value=at(c.node,[rule[1]]);if(value.kind==='string'&&value.value&&!targets.children.some(t=>t.key===value.value))issues.push({level:'warning',path:prefix.concat(rule[0],c.key,rule[1]),message:'Reference '+JSON.stringify(value.value)+' is not present in '+rule[2]+'. It may be supplied at runtime.'});}catch{}});}catch{}});
  issues.push({level:'warning',path:[],message:'Local checks use cached community references. Official Voyage validation is a separate connected action. Unknown fields are preserved; world scripts are never executed.'});return issues.slice(0,201);
}
export function search(source:string,query:string,limit=60){const root=parse(source),results:{path:Path;preview:string}[]=[];const needle=query.trim().toLowerCase();if(!needle)return results;
  function walk(n:Node,path:Path){if(results.length>=limit)return;const key=path.length?String(path[path.length-1]):'$';if(key.toLowerCase().indexOf(needle)>=0||(n.kind==='string'&&String(n.value).toLowerCase().indexOf(needle)>=0))results.push({path,preview:n.kind==='string'?String(n.value).slice(0,160):n.kind});n.children.forEach(c=>walk(c.node,path.concat(c.key)));}walk(root,[]);return results;
}
export function context(source:string,query:string){const root=parse(source),base=statePath(root),world=at(root,base);const matches=search(source,query,12);let paths=matches.map(m=>m.path);
  const words=query.toLowerCase().split(/\W+/).filter(w=>w.length>3);
  world.children.forEach(c=>{if(words.some(w=>String(c.key).toLowerCase().indexOf(w)>=0))paths.push(base.concat(c.key));});
  const aliases:{[key:string]:string[]}={skill:['skills','skillSettings','attributeSettings'],npc:['npcs','npcTypes','aiInstructions'],location:['locations','regions','realms'],school:['skills','skillSettings','locations'],trigger:['triggers'],story:['storySettings','storyStarts','aiInstructions']};
  Object.keys(aliases).forEach(alias=>{if(query.toLowerCase().indexOf(alias)>=0)aliases[alias].forEach(k=>{if(world.children.some(c=>c.key===k))paths.push(base.concat(k));});});
  const seen:Record<string,boolean>=Object.create(null);let budget=16000;const excerpts:{path:Path;source:string;truncated:boolean}[]=[];
  paths.forEach(path=>{const key=JSON.stringify(path);if(seen[key]||budget<=0)return;seen[key]=true;const n=at(root,path),text=source.slice(n.start,n.end),excerpt=text.slice(0,Math.min(5000,budget));budget-=excerpt.length;excerpts.push({path,source:excerpt,truncated:excerpt.length<text.length});});
  return {sections:world.children.map(c=>c.key),excerpts,selection:'Exact names, lexical matches, and curated aliases. Use read/search tools for more context.'};
}
