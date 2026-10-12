import {request} from './host';
import {feature,saveFeature} from './feature-store';
import type {Asset} from './features-api';
import {assetSlots,mediaUrl} from '../../../packages/core/studio';
import {inspectMedia,mergeLibraryAsset,latitudeUrl,type LibraryAsset,type RemoteAsset} from '../../../packages/core/asset-library';
import * as doc from '../../../packages/core/document';
export type {LibraryAsset,RemoteAsset} from '../../../packages/core/asset-library';
const key='asset-library';
export async function library(){return feature<LibraryAsset[]>(key,[]);}
export async function updateLibrary(change:(records:LibraryAsset[])=>LibraryAsset[]){
 for(let attempt=0;attempt<4;attempt++){
  const raw=await request('featureGet',{key}),records:LibraryAsset[]=raw?JSON.parse(raw):[],next=change(records);
  try{await request('featureSet',{key,expected:raw,value:JSON.stringify(next)});return next;}catch(error){if(!(error instanceof Error)||!/This feature changed/.test(error.message)||attempt===3)throw error;}
 }
 throw new Error('Library changed. Reload and try again.');
}
export async function registerLocal(asset:Asset){
 const info=inspectMedia(asset.dataUrl),record:LibraryAsset={id:info.sha256,name:asset.name||'Generated artwork',aliases:[],created:asset.created,kind:info.kind,mime:info.mime,storageId:asset.id,sha256:info.sha256,bytes:info.bytes,remote:[],tags:[]};
 const records=await updateLibrary(previous=>mergeLibraryAsset(previous,record));return records.find(item=>item.sha256===info.sha256)!;
}
export async function importLocal(data:{dataUrl:string;name?:string;prompt:string;route?:any}):Promise<Asset>{
 const info=inspectMedia(data.dataUrl),existing=(await library()).find(item=>item.sha256===info.sha256&&item.storageId);
 if(existing){const stored=await feature<Asset|null>('asset:'+existing.storageId,null);if(stored){await registerLocal({...stored,name:data.name||stored.name});return stored;}}
 const asset={...data,dataUrl:'data:'+info.mime+';base64,'+data.dataUrl.split(',')[1],id:info.sha256,created:Date.now()};
 await saveFeature('asset:'+asset.id,asset);await registerLocal(asset);return asset;
}
export async function registerRemote(url:string,kind:'image'|'audio',name:string,remote:Partial<RemoteAsset>={},storageId?:string){
 mediaUrl(url);
 const records=await library(),local=storageId?records.find(item=>item.storageId===storageId):undefined;
 const record:LibraryAsset={id:local?.id||'url-'+crypto.randomUUID(),name:name||url.split('/').pop()||'Hosted asset',aliases:[],kind,mime:kind==='audio'?'audio/mpeg':'image/*',created:Date.now(),remote:[{url,state:'existing',created:Date.now(),...remote}],tags:[]};
 if(local){record.storageId=local.storageId;record.sha256=local.sha256;record.bytes=local.bytes;record.mime=local.mime;}
 return updateLibrary(previous=>mergeLibraryAsset(previous,record));
}
export async function indexProjectAssets(project:any){
 const incoming:LibraryAsset[]=[];
 for(const source of [project.originalSource,project.activeSource,project.remote.envelopeSource].filter(Boolean)){
  const slots=assetSlots(source),root=doc.parse(source);let visited=0;
  const walk=(node:doc.Node,path:doc.Path,depth:number)=>{
   if(++visited>100000||depth>128)throw new Error('Hosted-URL discovery exceeds the 100,000-node / 128-depth limit.');
   if(node.kind==='string'&&latitudeUrl(String(node.value))&&!slots.some(slot=>JSON.stringify(slot.path)===JSON.stringify(path))){const url=String(node.value);slots.push({path,url,kind:/\.(mp3|wav|ogg|m4a|mp4)(\?|$)|\/audio\//i.test(url)?'audio':'image'});}
   node.children.forEach(child=>walk(child.node,path.concat(child.key),depth+1));
  };walk(root,[],0);
  for(const slot of slots){
   if(!slot.url.startsWith('https://'))continue;
   try{mediaUrl(slot.url);}catch{continue;}
   incoming.push({id:'url-'+crypto.randomUUID(),name:String(slot.path[slot.path.length-2]||'World asset'),aliases:[],kind:slot.kind,mime:slot.kind==='audio'?'audio/mpeg':'image/*',created:Date.now(),remote:[{url:slot.url,state:source===project.remote.envelopeSource?'durable':'existing',target:slot.target,created:Date.now(),environment:project.remote.environment}],tags:[]});
  }
 }
 if(!incoming.length)return;
 const current=await library();
 const additions=incoming.filter(item=>!current.some(existing=>existing.remote.some(remote=>remote.url===item.remote[0].url&&(remote.state==='durable'||item.remote[0].state!=='durable'))));
 if(additions.length)await updateLibrary(previous=>additions.reduce(mergeLibraryAsset,previous));
}
export async function discoverAssets(onProgress?:(message:string)=>void){
 const keys:string[]=await request('assetKeys');let imported=0,failed=0;
 for(const storageId of keys){try{if((await library()).some(asset=>asset.storageId===storageId))continue;const asset=await feature<Asset|null>('asset:'+storageId,null);if(asset){await registerLocal(asset);imported++;}}catch{failed++;}onProgress?.(`${imported} local assets indexed; ${failed} could not be indexed.`);}
 const projects=await request('projects');
 for(const item of projects){
  const project=(await request('project',{id:item.id})).project;
  const uploads=await feature<any[]>('uploads:'+item.id,[]);
  for(const upload of uploads)if(upload.state==='ready'&&upload.imageUrl)try{await registerRemote(upload.imageUrl,'image','Uploaded image',{target:upload.target,state:'existing',environment:project.remote.environment},upload.assetId);}catch{failed++;}
  try{await indexProjectAssets(project);}catch{failed++;}
 }
 return {imported,failed};
}
export async function assetData(asset:LibraryAsset){if(!asset.storageId)throw new Error('This asset has no local source bytes.');const stored=await feature<Asset|null>('asset:'+asset.storageId,null);if(!stored)throw new Error('Local source bytes are missing. The hosted reference is retained.');if(asset.sha256&&inspectMedia(stored.dataUrl).sha256!==asset.sha256)throw new Error('Local asset integrity check failed. The hosted reference is retained.');return stored;}
