import * as doc from './document';
import {put,worldPath} from './features';

export const musicCues=['character-creation','combat','travel','near-death','dying','dead','recovery'];
export const publicationFields=['title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags'] as const;
export function mediaUrl(value:string){
 if(value.length>8192)throw new Error('Media URL exceeds 8,192 characters.');
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Use an HTTPS media URL without credentials or a fragment.');
 url.searchParams.forEach((_value,key)=>{if(/^(token|access_token|api[-_]?key|key|signature|x-amz-|x-goog-|authorization)/i.test(key))throw new Error('Use a permanent media URL, not a credential-bearing signed URL.');});
 return value;
}
export function musicPath(source:string){return doc.statePath(doc.parse(source)).concat('gameplayMusicSettings');}
export function musicInspect(source:string){
 const path=musicPath(source);let node:doc.Node;
 try{node=doc.at(doc.parse(source),path);}catch{return {path,present:false,tracks:[] as {id:string;source:string}[],characterCreationTrackId:''};}
 if(node.kind!=='object')throw new Error('Music settings must be an object. Repair them in JSON.');
 const tracks=node.children.find(child=>child.key==='tracks')?.node;
 if(tracks&&tracks.kind!=='object')throw new Error('Music tracks must be a record. Repair them in JSON.');
 const selected=node.children.find(child=>child.key==='characterCreationTrackId')?.node;
 return {path,present:true,tracks:(tracks?.children||[]).map(child=>({id:String(child.key),source:source.slice(child.node.start,child.node.end)})),characterCreationTrackId:selected?.kind==='string'?String(selected.value):''};
}
export function musicCreate(source:string,id:string){
 if(!id.trim()||id!==id.trim()||id.length>120)throw new Error('Track ID must be 1–120 characters without surrounding spaces.');
 let info=musicInspect(source);
 if(!info.present)source=doc.insert(source,info.path.slice(0,-1),'gameplayMusicSettings','{"characterCreationTrackId":"","tracks":{}}');
 info=musicInspect(source);
 const parent=doc.at(doc.parse(source),info.path);
 if(!parent.children.some(child=>child.key==='tracks'))source=doc.insert(source,info.path,'tracks','{}');
 if(info.tracks.some(track=>track.id===id))throw new Error('That track ID already exists.');
 return doc.insert(source,info.path.concat('tracks'),id,'{"variants":[]}');
}
export function musicSelect(source:string,id:string){
 const info=musicInspect(source);
 if(id&&!info.tracks.some(track=>track.id===id))throw new Error('Choose an existing track.');
 return put(source,info.path,'characterCreationTrackId',JSON.stringify(id));
}
export function musicRemove(source:string,id:string){
 const info=musicInspect(source);
 if(info.characterCreationTrackId===id)throw new Error('Choose another character-creation track or clear its selection before removing this track.');
 return doc.remove(source,info.path.concat('tracks',id));
}
export function publicationEdit(source:string,field:string,raw:string){
 if(!publicationFields.includes(field as any))throw new Error('This publication field is not author-editable.');
 const node=doc.parse(raw);
 if(['isLocked','isMod','isUnremixable'].includes(field)){
  if(node.kind!=='boolean')throw new Error('Use a boolean publication setting.');
 }else if(field==='tags'){
  if(node.kind!=='array'||node.children.length>10||node.children.some(child=>child.node.kind!=='string'||String(child.node.value).length>25))throw new Error('Use at most 10 text tags, each up to 25 characters.');
 }else if(node.kind!=='string'&&!(node.kind==='null'&&['advancedDescription','discordThreadUrl','image'].includes(field)))throw new Error('Use text for this publication field.');
 if(field==='title'&&(node.kind!=='string'||!String(node.value).trim()))throw new Error('A public title is required.');
 if(['image','discordThreadUrl'].includes(field)&&node.kind==='string'&&node.value)mediaUrl(String(node.value));
 if(!doc.statePath(doc.parse(source)).length)throw new Error('Bare GameState has no publication envelope. Save creation details separately.');
 return put(source,worldPath(source),field,raw);
}
export type AssetSlot={path:doc.Path;kind:'image'|'audio';target?:string;url:string;present?:boolean};
export function assetSlots(source:string){
 const root=doc.parse(source),base=doc.statePath(root),result:AssetSlot[]=[];let visited=0;
 const walk=(node:doc.Node,path:doc.Path,depth:number)=>{
  if(++visited>100000||depth>128)throw new Error('Asset inspection exceeds the 100,000-node / 128-depth limit.');
  const key=String(path[path.length-1]||'');
  if(node.kind==='string'){
   const music=path.includes('gameplayMusicSettings')&&path.includes('variants')&&['url','narrationUrl','gameplayUrl'].includes(key);
   const image=/^(image|imageUrl|portraitUrl|portrait|mapImageUrl|establishingShotUrl)$/i.test(key);
   const relative=path.slice(base.length),section=relative[0];
   if(music||image)result.push({path,kind:music?'audio':'image',url:String(node.value),target:music?undefined:section==='npcs'||section==='premadeCharacters'?'NPC_PORTRAIT':section==='itemTypes'?'ITEM_IMAGE':section==='regions'?'REGION_MAP_IMAGE':section==='locations'?(relative[2]==='areas'?'AREA_IMAGE':'LOCATION_IMAGE'):undefined});
  }
  node.children.forEach(child=>walk(child.node,path.concat(child.key),depth+1));
 };
 walk(doc.at(root,base),base,0);
 const addMissing=(entry:doc.Node,path:doc.Path,field:doc.Path,target?:string)=>{
  if(entry.kind!=='object')return;
  const destination=path.concat(field);
  if(result.some(slot=>JSON.stringify(slot.path)===JSON.stringify(destination)))return;
  try{if(doc.at(root,destination).kind!=='null')return;}catch{}
  for(let index=1;index<field.length;index++){try{if(doc.at(root,path.concat(field.slice(0,index))).kind!=='object')return;}catch{}}
  result.push({path:destination,kind:'image',target,url:'',present:false});
 };
 for(const section of ['npcs','premadeCharacters','regions','locations','itemTypes']){
  let collection:doc.Node;try{collection=doc.at(root,base.concat(section));}catch{continue;}
  for(const child of collection.children){const path=base.concat(section,child.key);addMissing(child.node,path,section==='npcs'||section==='premadeCharacters'?['portraitUrl']:section==='itemTypes'?['imageUrl']:section==='regions'?['images','map','imageUrl']:['images','establishingShot','imageUrl'],section==='regions'?'REGION_MAP_IMAGE':section==='locations'?'LOCATION_IMAGE':section==='itemTypes'?'ITEM_IMAGE':'NPC_PORTRAIT');
   if(section==='locations'){const areas=child.node.children.find(field=>field.key==='areas')?.node;if(areas?.kind==='object')for(const area of areas.children)addMissing(area.node,path.concat('areas',area.key),['images','establishingShot','imageUrl'],'AREA_IMAGE');}
  }
 }
 if(base.length){const parent=base.slice(0,-1),world=doc.at(root,parent),node=world.children.find(child=>child.key==='image')?.node;if(node?.kind==='string')result.push({path:parent.concat('image'),kind:'image',url:String(node.value)});else addMissing(world,parent,['image']);}
 return result;
}
export function assignAsset(source:string,path:doc.Path,url:string){
 mediaUrl(url);
 if(!assetSlots(source).some(slot=>JSON.stringify(slot.path)===JSON.stringify(path)))throw new Error('Choose an existing authored image or music URL field.');
 let next=source;
 for(let index=doc.statePath(doc.parse(source)).length+1;index<path.length;index++){
  const prefix=path.slice(0,index);try{if(!['object','array'].includes(doc.at(doc.parse(next),prefix).kind))throw new Error('Asset destination parent is not an object or array.');}catch(error){if((error as Error).message==='Asset destination parent is not an object or array.')throw error;next=doc.insert(next,prefix.slice(0,-1),prefix[prefix.length-1],'{}');}
 }
 const parent=path.slice(0,-1);return put(next,parent,String(path[path.length-1]),JSON.stringify(url));
}
export type ModSource={id:string;source?:string;version?:number|null;verifiedVersion?:number|null};
export function modConflicts(mods:ModSource[],limit=1000){
 const unknown:string[]=[],findings:{path:doc.Path;first:string;second:string;kind:'conflict'|'shared';before:string;after:string}[]=[];
 const records:{id:string;leaves:{path:doc.Path;raw:string;kind:string}[]}[]=[];let visited=0,total=0;
 for(const mod of mods){
  if(!mod.source||(mod.version!=null&&mod.version!==mod.verifiedVersion)){unknown.push(mod.id);continue;}
  const leaves:{path:doc.Path;raw:string;kind:string}[]=[];
  try{
   const root=doc.parse(mod.source),base=doc.statePath(root);
   if(doc.at(root,base).kind!=='object')throw new Error('Mod state is not an object.');
   const walk=(node:doc.Node,path:doc.Path,depth:number)=>{
    if(++visited>100000||depth>128)throw new Error('Mod inspection limit exceeded.');
    if(!path.length||node.kind==='object'&&node.children.length)node.children.forEach(child=>{if(!path.length&&['mods','shortId','heroesVersion','configVersion'].includes(String(child.key)))return;walk(child.node,path.concat(child.key),depth+1);});
    else leaves.push({path,raw:mod.source!.slice(node.start,node.end),kind:node.kind});
   };walk(doc.at(root,base),[],0);records.push({id:mod.id,leaves});
  }catch{unknown.push(mod.id);}
 }
 let comparisons=0,limited=false;
 comparisonsLoop:for(let first=0;first<records.length;first++)for(let second=first+1;second<records.length;second++)for(const left of records[first].leaves)for(const right of records[second].leaves){
  if(++comparisons>1000000){limited=true;break comparisonsLoop;}
  const length=Math.min(left.path.length,right.path.length);
  if(!left.path.slice(0,length).every((key,index)=>key===right.path[index]))continue;
  const same=left.path.length===right.path.length&&left.kind===right.kind&&(left.raw===right.raw||!doc.diff(left.raw,right.raw,1).total);
  total++;if(findings.length<limit)findings.push({path:left.path.slice(0,length),first:records[first].id,second:records[second].id,kind:same?'shared':'conflict',before:left.raw,after:right.raw});
 }
 return {findings,unknown,total,truncated:limited||total>limit,limited};
}
