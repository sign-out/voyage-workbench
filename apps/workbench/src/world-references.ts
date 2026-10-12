import {at,parse,statePath,type Node,type Path} from '../../../packages/core/document';

export interface WorldReference {id:string;name:string;parent?:string}
export type ReferenceCatalog=Record<string,WorldReference[]>;
export function nodeText(node:Node,key:string){const child=node.children.find(entry=>entry.key===key)?.node;return child?.kind==='string'?String(child.value):'';}
export function referenceCatalog(source:string):ReferenceCatalog{
 const catalog:ReferenceCatalog={};
 try{
  const root=parse(source),world=at(root,statePath(root));
  for(const section of ['factions','regions','realms','locations','worldVoices','npcTypes']){
   const collection=world.children.find(child=>child.key===section)?.node;
   catalog[section]=(collection?.kind==='object'?collection.children:[]).map(child=>({id:String(child.key),name:nodeText(child.node,'properName')||nodeText(child.node,'name')||nodeText(child.node,'label')||String(child.key)}));
  }
  const locations=world.children.find(child=>child.key==='locations')?.node;
  catalog.areas=[];
  if(locations?.kind==='object')for(const location of locations.children){
   const areas=location.node.children.find(child=>child.key==='areas')?.node;
   if(areas?.kind==='object')for(const area of areas.children)catalog.areas.push({id:String(area.key),name:nodeText(area.node,'name')||String(area.key),parent:String(location.key)});
  }
 }catch{}
 return catalog;
}
export function referenceTarget(section:string|undefined,path:Path){
 const keys=path.filter(key=>typeof key==='string') as string[],field=keys.at(-1),scope=section||keys.find(key=>['npcs','premadeCharacters','locations','regions'].includes(key));
 if(!scope)return undefined;
 if(['npcs','premadeCharacters'].includes(scope))return ({faction:'factions',currentLocation:'locations',currentArea:'areas',worldVoiceId:'worldVoices',type:'npcTypes'} as Record<string,string>)[field||''];
 if(scope==='locations')return ({region:'regions',factions:'factions'} as Record<string,string>)[field||''];
 if(scope==='regions')return ({realm:'realms',factions:'factions'} as Record<string,string>)[field||''];
 return undefined;
}
export function safeImageUrl(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function entryImage(node:Node){
 const portrait=safeImageUrl(nodeText(node,'portraitUrl'));if(portrait)return portrait;
 for(const path of [['images','map','imageUrl'],['images','establishingShot','imageUrl']]){
  try{const image=at(node,path);if(image.kind==='string'){const url=safeImageUrl(String(image.value));if(url)return url;}}catch{}
 }
 return '';
}
export function healthSummary(source:string,node:Node){
 try{
  const current=at(node,['hpCurrent']),maximum=at(node,['hpMax']);if(current.kind!=='number'||maximum.kind!=='number')return undefined;
  const currentRaw=source.slice(current.start,current.end),maxRaw=source.slice(maximum.start,maximum.end),currentValue=Number(currentRaw),maximumValue=Number(maxRaw);
  const reliable=/^\d+$/.test(currentRaw)&&/^\d+$/.test(maxRaw)&&Number.isSafeInteger(currentValue)&&Number.isSafeInteger(maximumValue)&&currentValue>=0&&maximumValue>0;
  return {current:currentRaw,maximum:maxRaw,percentage:reliable?Math.min(100,currentValue/maximumValue*100):undefined};
 }catch{return undefined;}
}
