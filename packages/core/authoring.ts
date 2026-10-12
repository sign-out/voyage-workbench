import * as doc from './document';
import type {Project} from './project';

import {relationshipRules} from './relationships';
export {relationshipRules} from './relationships';
export interface Entry {path:doc.Path;name:string;kind:doc.Node['kind'];section:string}
export interface AuthoringPreferences {
 advisorySections:string[];recentLimit:number;guidanceExpanded:boolean;readinessAdvice:boolean;
 reviewGrouping:'entity'|'field';impactDirection:'all'|'incoming'|'outgoing';
 assetKind:'all'|'image'|'audio';scopeDefault:'selected'|'system';
 duplicateName:boolean;batchField:string;includeNotes:boolean;
}
export const authoringDefaults:AuthoringPreferences={advisorySections:['worldBackground','npcs','locations','regions'],recentLimit:10,guidanceExpanded:false,readinessAdvice:true,reviewGrouping:'entity',impactDirection:'all',assetKind:'all',scopeDefault:'selected',duplicateName:true,batchField:'name',includeNotes:true};
export function authoringPreferences(input:unknown):AuthoringPreferences {
 const value=input&&typeof input==='object'?input as Partial<AuthoringPreferences>:{};
 return {...authoringDefaults,
  advisorySections:Array.isArray(value.advisorySections)?value.advisorySections.filter((section,index,sections)=>typeof section==='string'&&section.length<=100&&sections.indexOf(section)===index).slice(0,100):authoringDefaults.advisorySections.slice(),
  recentLimit:Number.isInteger(value.recentLimit)?Math.max(0,Math.min(50,value.recentLimit!)):10,
  guidanceExpanded:typeof value.guidanceExpanded==='boolean'?value.guidanceExpanded:false,
  readinessAdvice:typeof value.readinessAdvice==='boolean'?value.readinessAdvice:true,
  reviewGrouping:value.reviewGrouping==='field'?'field':'entity',
  impactDirection:value.impactDirection==='incoming'||value.impactDirection==='outgoing'?value.impactDirection:'all',
  assetKind:value.assetKind==='image'||value.assetKind==='audio'?value.assetKind:'all',
  scopeDefault:value.scopeDefault==='system'?'system':'selected',
  duplicateName:typeof value.duplicateName==='boolean'?value.duplicateName:true,
  batchField:typeof value.batchField==='string'&&value.batchField.trim()&&value.batchField.length<=100?value.batchField:'name',
  includeNotes:typeof value.includeNotes==='boolean'?value.includeNotes:true};
}
const same=(left:doc.Path,right:doc.Path)=>JSON.stringify(left)===JSON.stringify(right);
const inside=(parent:doc.Path,path:doc.Path)=>parent.length<=path.length&&parent.every((part,index)=>part===path[index]);
export function authoredPath(source:string,path:doc.Path,allowRoot=false){
 const root=doc.parse(source),base=doc.statePath(root);
 if(!Array.isArray(path)||path.some(key=>typeof key!=='string'&&(typeof key!=='number'||!Number.isSafeInteger(key)||key<0))||!inside(base,path)||(!allowRoot&&path.length<=base.length))throw new Error('Choose an entry inside authored world content.');
 if(!base.length&&doc.packageReadOnlyFields.includes(String(path[0])))throw new Error('Package identity is not authored content.');
 doc.at(root,path);return path;
}
export function entryCatalog(source:string,query='',offset=0,limit=40){
 const root=doc.parse(source),base=doc.statePath(root),rows:Entry[]=[];let visited=0,truncated=false;
 function walk(node:doc.Node,path:doc.Path){
  if(++visited>100000||path.length>128){truncated=true;return;}
  const nameChild=node.children.find(child=>['name','properName','label'].includes(String(child.key))&&child.node.kind==='string');
  const name=String(nameChild?.node.value||path[path.length-1]||'World');
  if(path.length>base.length&&!doc.packageReadOnlyFields.includes(String(path[base.length]))&&(doc.label(path)+' '+name).toLowerCase().includes(query.toLowerCase()))rows.push({path,name,kind:node.kind,section:String(path[base.length])});
  for(const child of node.children){if(visited>=100000){truncated=true;break;}walk(child.node,path.concat(child.key));}
 }
 walk(doc.at(root,base),base);return {entries:rows.slice(offset,offset+limit),total:rows.length,truncated};
}
export function referenceImpact(source:string,path:doc.Path,direction='all',offset=0,limit=40){
 const root=doc.parse(source),base=doc.statePath(root),world=doc.at(root,base),links:{from:doc.Path;to:doc.Path;missing:boolean;direction:string}[]=[];
 for(const rule of relationshipRules){
  const collection=world.children.find(child=>child.key===rule.section)?.node;
  if(collection?.kind!=='object')continue;
  for(const entry of collection.children){
   const field=entry.node.children.find(child=>child.key===rule.field)?.node;
   if(field?.kind!=='string'||!field.value)continue;
   const from=base.concat(rule.section,entry.key,rule.field),to=base.concat(rule.target,String(field.value));
   const incoming=inside(path,to)||inside(to,path),outgoing=inside(path,from)||inside(from,path);
   if(!(incoming||outgoing)||direction==='incoming'&&!incoming||direction==='outgoing'&&!outgoing)continue;
   let missing=false;try{doc.at(root,to);}catch{missing=true;}
   links.push({from,to,missing,direction:incoming&&outgoing?'both':incoming?'incoming':'outgoing'});
  }
 }
 return {links:links.slice(offset,offset+limit),total:links.length,coverage:relationshipRules.map(rule=>rule.section+'.'+rule.field+' → '+rule.target),limitation:'Known structural references only. Scripts, prose, custom fields and runtime relationships are not interpreted.'};
}
export function completeness(source:string,references:any[]=[],sections=authoringDefaults.advisorySections){
 const issues=doc.validate(source,references),root=doc.parse(source),base=doc.statePath(root),world=doc.at(root,base);
 const advice:{path:doc.Path;message:string}[]=[];sections.forEach(section=>{const node=world.children.find(child=>child.key===section)?.node;if(!node||node.kind==='string'&&!String(node.value).trim()||['object','array'].includes(node.kind)&&!node.children.length)advice.push({path:base.concat(section),message:section+' is absent or empty. Include it only if this world needs it.'});});
 return {issues,advice,coverage:references.length?'Bundled schema checks, capped at 200 findings. Unknown fields are retained, not declared invalid.':'Schema reference unavailable; only built-in structural checks are available.'};
}
export function readiness(project:Project,references:any[]=[],sourceHash:string,official?:{hash:string;valid:boolean;stage:string;created:number},publicationOps:any[]=[],stage='publish'){
 const issues=doc.validate(project.activeSource,references),errors=issues.filter(issue=>issue.level==='error');
 const unknown=project.remote.operations.some(operation=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(operation.state))||publicationOps.some(operation=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(operation.state));
 return [
  {id:'draft',state:project.draft?'blocked':'pass',message:project.draft?'Apply or discard the editor draft.':'No unapplied editor draft.'},
  {id:'agent',state:project.tasks.some(task=>['PREPARED','RUNNING'].includes(task.state))?'blocked':'pass',message:'Active agents must finish or stop before remote publication.'},
  {id:'local',state:errors.length?'blocked':references.length?'pass':'unknown',message:errors.length+' structural errors; '+issues.filter(issue=>issue.level==='warning').length+' warnings. Local checks are not official approval.'},
  {id:'proposals',state:project.candidates.length?'advisory':'pass',message:project.candidates.length+' staged proposals are not part of the active world.'},
  {id:'remote',state:!project.remote.worldId?'unknown':project.remote.baselineHash===sourceHash?'pass':'stale',message:!project.remote.worldId?'No linked remote draft.':project.remote.baselineHash===sourceHash?'Matches the last recorded remote baseline; not a live remote check.':'Active content differs from the recorded remote baseline.'},
  {id:'journal',state:unknown?'blocked':'pass',message:unknown?'Reconcile uncertain save/publication requests.':'No unresolved recorded remote request.'},
  {id:'official',state:!official?'unknown':official.hash!==sourceHash?'stale':official.stage!==stage?'unknown':official.valid?'pass':'blocked',message:official?'Official '+official.stage+' validation recorded '+new Date(official.created).toISOString()+'. '+(official.stage!==stage?'It does not cover the selected '+stage+' stage. ':'')+'This is not moderation approval.':'Official validation has not been recorded for this revision.'},
  {id:'moderation',state:'unknown',message:'Check official moderation status before publishing. Local checks cannot certify it.'},
 ];
}
export function assetInventory(source:string,kind='all',offset=0,limit=40){
 const root=doc.parse(source),rows:{value:string;kind:string;paths:doc.Path[];bytes:number|null;status:string}[]=[],index:Record<string,number>=Object.create(null);let visited=0,truncated=false;
 function walk(node:doc.Node,path:doc.Path){
  if(++visited>100000||path.length>128){truncated=true;return;}
  const key=String(typeof path[path.length-1]==='number'?path[path.length-2]:path[path.length-1]||''),value=node.kind==='string'?String(node.value):'';
  if(value&&/(image|portrait|avatar|audio|sound|music|voiceUrl|mapUrl|texture|assetUrl)(Url|Uri|Src|Source|Path)?$/i.test(key)){
   const assetKind=/audio|sound|music|voiceUrl/i.test(key)?'audio':'image';
   if(kind==='all'||kind===assetKind){
    const existing=index[value];if(existing!==undefined)rows[existing].paths.push(path);
    else {const inline=/^data:[^;,]+;base64,([a-zA-Z0-9+/]*={0,2})$/.exec(value),bytes=inline?Math.floor(inline[1].length*3/4)-(inline[1].endsWith('==')?2:inline[1].endsWith('=')?1:0):null;index[value]=rows.length;rows.push({value: inline?'Inline '+assetKind+' ('+bytes+' bytes)':value,kind:assetKind,paths:[path],bytes,status:inline?'embedded':/^https?:\/\//i.test(value)?'remote · size and availability unknown':'local/reference · availability unknown'});}
   }
  }
  for(const child of node.children){if(visited>=100000){truncated=true;break;}walk(child.node,path.concat(child.key));}
 }
 walk(root,[]);return {assets:rows.slice(offset,offset+limit),total:rows.length,truncated};
}
export function duplicateEntry(source:string,path:doc.Path,newKey:string,name?:string){
 authoredPath(source,path);const root=doc.parse(source),base=doc.statePath(root);
 if(path.length!==base.length+2||doc.at(root,path.slice(0,-1)).kind!=='object'||doc.at(root,path).kind!=='object')throw new Error('Duplication supports object entries in authored record collections, not package metadata, arrays or whole systems.');
 if(!newKey.trim()||newKey!==newKey.trim()||newKey.length>120||['__proto__','prototype','constructor'].includes(newKey))throw new Error('Provide a safe, nonempty new content ID of at most 120 characters.');
 if(doc.at(root,path.slice(0,-1)).children.some(child=>child.key===newKey))throw new Error('That content ID already exists.');
 let raw=doc.read(source,path);const entry=doc.parse(raw),identity=entry.children.find(child=>child.key==='id');
 if(entry.children.some(child=>doc.packageReadOnlyFields.includes(String(child.key))))throw new Error('This entry contains package identity metadata. Duplicate authored content, not package records.');
 if(identity){if(identity.node.kind!=='string'||identity.node.value!==path[path.length-1])throw new Error('The entry has an independent identity field. Duplicate it manually after reviewing identity semantics.');raw=doc.edit(raw,['id'],JSON.stringify(newKey));}
 if(name!==undefined){if(!name.trim()||name.length>1000)throw new Error('Provide a nonempty display name.');const field=entry.children.find(child=>child.key==='name'||child.key==='properName');if(!field||field.node.kind!=='string')throw new Error('This entry has no supported name field.');raw=doc.edit(raw,[field.key],JSON.stringify(name.trim()));}
 const result=doc.insert(source,path.slice(0,-1),newKey,raw);doc.assertPackageMetadataUnchanged(source,result);return result;
}
export function batchEdit(source:string,paths:doc.Path[],field:string,replacement:string){
 if(!paths.length||paths.length>100||paths.map(path=>JSON.stringify(path)).some((path,index,keys)=>keys.indexOf(path)!==index))throw new Error('Select 1–100 distinct entries.');
 if(!field||doc.packageReadOnlyFields.includes(field)||['id','__proto__','constructor','prototype'].includes(field))throw new Error('Identity fields cannot be batch edited.');
 const root=doc.parse(source),base=doc.statePath(root),value=doc.parse(replacement);if(['object','array'].includes(value.kind))throw new Error('Batch editing supports one existing scalar field.');
 const collection=paths[0].slice(0,-1);
 for(const path of paths){authoredPath(source,path);if(path.length!==base.length+2||!same(path.slice(0,-1),collection)||doc.at(root,path).kind!=='object')throw new Error('Select entries from one authored record collection.');const previous=doc.at(root,path.concat(field));if(previous.kind!==value.kind)throw new Error('The replacement type must match every selected field.');if(relationshipRules.some(rule=>rule.section===String(path[base.length])&&rule.field===field))throw new Error('Reference fields need individual impact review, not batch replacement.');}
 let result=source;for(const path of paths)result=doc.edit(result,path.concat(field),replacement);doc.assertPackageMetadataUnchanged(source,result);return result;
}
export function reviewEntity(source:string,path:doc.Path){const base=doc.statePath(doc.parse(source));return inside(base,path)?path.slice(0,Math.min(path.length,base.length+2)):path.slice(0,1);}
export function groupedChanges(source:string,changes:doc.Change[],grouping='entity'){
 const groups:{path:doc.Path;changes:doc.Change[]}[]=[],index:Record<string,number>=Object.create(null),base=doc.statePath(doc.parse(source));
 for(const change of changes){const path=grouping==='field'?change.path:inside(base,change.path)?change.path.slice(0,Math.min(change.path.length,base.length+2)):change.path.slice(0,1),key=JSON.stringify(path);let position=index[key];if(position===undefined){position=groups.length;index[key]=position;groups.push({path,changes:[]});}groups[position].changes.push(change);}
 return groups;
}
