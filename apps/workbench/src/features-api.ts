import {request} from './host';import * as doc from '../../../packages/core/document';import {hash,remotePayload,type Project} from '../../../packages/core/project';
import {feature,saveFeature} from './feature-store';
export {feature,saveFeature} from './feature-store';
import {importLocal,library,registerRemote} from './asset-library';
import {reusableRemote} from '../../../packages/core/asset-library';
import {imageTargets} from '../../../packages/core/artwork';
export interface UploadBinding {projectId:string;environment:string;worldId:string}
export async function creator(method:string,endpoint:string,body?:string,idempotencyKey?:string,binding?:UploadBinding){const r=await request('creatorRequest',{method,endpoint,body,idempotencyKey,...binding});return {...r,data:JSON.parse(r.text)};}
export const worldSource=(source:string)=>doc.read(source,doc.statePath(doc.parse(source)).slice(0,-1));
export async function validateSource(source:string,stage='draft'){return (await creator('POST','/validate','{"stage":'+JSON.stringify(stage)+',"world":{"initialGameState":'+doc.read(source,doc.statePath(doc.parse(source)))+'}}')).data;}
export const valid=(report:any)=>report?.valid===true||report?.data?.valid===true||report?.success===true;
export function privateDraft(p:Project,creationDetails='{}'){
 const path=doc.statePath(doc.parse(p.activeSource)),fields:Record<string,string>={title:JSON.stringify(p.name),visibility:'"private"',initialGameState:doc.read(p.activeSource,path)};
 if(path.length){const parent=doc.at(doc.parse(p.activeSource),path.slice(0,-1));for(const key of ['title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags'])if(parent.children.some(child=>child.key===key))fields[key]=doc.read(p.activeSource,path.slice(0,-1).concat(key));}
 else{const details=doc.parse(creationDetails);if(details.kind!=='object')throw new Error('Creation details must be an object.');for(const child of details.children){const key=String(child.key);if(!['title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags'].includes(key))throw new Error('Unsupported creation detail: '+key);fields[key]=creationDetails.slice(child.node.start,child.node.end);}}
 return '{"world":{'+Object.keys(fields).map(key=>JSON.stringify(key)+':'+fields[key]).join(',')+'}}';
}
export interface PublicationOperation {id:string;kind:string;worldId:string;body:string;sourceHash:string;created:number;state:string;result?:any;detail?:string}
export async function createWorldCopy(project:Project){
 const current=(await request('project',{id:project.id})).project as Project;
 if(current.draft||current.tasks.some(task=>['PREPARED','RUNNING'].includes(task.state)))throw new Error('Apply/discard the draft and finish the agent before creating a new world.');
 if(current.remote.operations.some(operation=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(operation.state)))throw new Error('Reconcile the pending save before creating a new world.');
 const publication=await feature<PublicationOperation[]>('publication:'+current.id,[]);
 if(publication.some(operation=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(operation.state)))throw new Error('Resolve the recorded publication request before creating another world. Replay the same request from the publication journal.');
 const details=await feature<string>('creation-details:'+current.id,'{}');
 const copy=await request('create',{name:current.name+' — new world',source:current.activeSource});
 await saveFeature('creation-details:'+copy.project.id,details);
 return copy;
}
export async function publicationAction(project:Project,kind:string,retry?:PublicationOperation){let p=(await request('project',{id:project.id})).project as Project;if(p.draft||p.tasks.some(t=>['PREPARED','RUNNING'].includes(t.state)))throw new Error('Apply/discard the draft and finish the agent before publication.');if(p.remote.operations.some(o=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(o.state)))throw new Error('Reconcile the remote save first.');const key='publication:'+p.id,ops=await feature<PublicationOperation[]>(key,[]);if(!retry&&ops.some(o=>['PREPARED','UNKNOWN','SEND_ATTEMPTED'].includes(o.state)))throw new Error('Resolve the recorded publication request before starting another.');let op=retry||{id:crypto.randomUUID(),kind,worldId:p.remote.worldId,body:kind==='create'?privateDraft(p,await feature<string>('creation-details:'+p.id,'{}')):kind==='moderation'?'{"forceFullCheck":false}':'{}',sourceHash:hash(p.activeSource),created:Date.now(),state:'PREPARED'};kind=op.kind;
 if(!retry){if(kind==='create'){if(p.remote.worldId)throw new Error('This project already has a linked draft.');if(!valid(await validateSource(p.activeSource)))throw new Error('Official draft validation must pass first.');}else if(!p.remote.worldId)throw new Error('Create or download a Voyage draft first.');ops.unshift(op);}
 else{if(!retry.result&&Date.now()-retry.created>23*60*60*1000)throw new Error('The exact-replay window expired. Inspect the Voyage draft before any new publication request.');const found=ops.find(v=>v.id===retry.id);if(!found)throw new Error('Recorded request not found.');op=found;}
 // No publication request is sent until this exact operation is durable.
 if(['publish','moderation'].includes(kind)){const remote=await creator('GET','/worlds/'+encodeURIComponent(op.worldId));const source=worldSource(remote.text);if(p.remote.worldId!==op.worldId||p.remote.etag!==remote.etag||doc.diff(remotePayload(p.activeSource),remotePayload(source)).total)throw new Error('Save and review the current Voyage draft before publication or moderation.');if(kind==='publish'&&!valid(await validateSource(source,'publish')))throw new Error('Publish validation did not pass.');}
 await saveFeature(key,ops);await request('checkpoint',{id:p.id,label:'Before Voyage '+kind});op.state='SEND_ATTEMPTED';await saveFeature(key,ops);
 try{if(!op.result){op.result=(await creator('POST',kind==='create'?'/worlds':'/worlds/'+encodeURIComponent(op.worldId)+'/'+kind,op.body,op.id)).data;await saveFeature(key,ops);}if(kind==='create'){const data=op.result.data||op.result,w=data.world||data;if(!w.shortId)throw new Error('Creation response has no world ID. Inspect owned worlds.');op.worldId=w.shortId;await saveFeature(key,ops);const latest=(await request('project',{id:p.id})).project as Project;if(latest.remote.worldId&&latest.remote.worldId!==op.worldId)throw new Error('Project linked elsewhere since creation.');await request('downloadWorld',{id:p.id,worldId:op.worldId});}else{await creator('GET','/worlds/'+encodeURIComponent(op.worldId));}op.state='CONFIRMED';op.detail=kind==='create'?'Draft created. Review the downloaded envelope in Proposals.':'Voyage acknowledged the action; draft read back.';await saveFeature(key,ops);return ops;}catch(e){op.state='UNKNOWN';op.detail=(e as Error).message;await saveFeature(key,ops);throw e;}
}
export async function imageInfo(dataUrl:string){if(!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl))throw new Error('Choose PNG, JPEG, or WebP.');const bytes=atob(dataUrl.split(',')[1]).slice(0,12);const mimeType=bytes.startsWith('\x89PNG\r\n\x1a\n')?'image/png':bytes.startsWith('\xff\xd8\xff')?'image/jpeg':bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'?'image/webp':'';if(!mimeType)throw new Error('Image bytes must be PNG, JPEG, or WebP.');const image=new Image();image.src=dataUrl;await image.decode();if(image.naturalWidth*image.naturalHeight>64000000)throw new Error('Image exceeds 64 megapixels.');return {width:image.naturalWidth,height:image.naturalHeight,mimeType,image};}
export interface Asset {id:string;prompt:string;created:number;dataUrl:string;route?:any;name?:string}
export async function saveAsset(data:Omit<Asset,'id'|'created'>){return importLocal(data);}
export interface Upload {id:string;projectId?:string;environment?:string;shortId:string;target:string;assetId:string;mimeType:string;width:number;height:number;state:string;step:string;uploadId?:string;directUploadUrl?:string;expiresAt?:string;imageUrl?:string;error?:string;created:number;bytesAttempted?:boolean;revision?:string}
const uploadQueues=new Map<string,Promise<unknown>>();
function serializeUpload<T>(projectId:string,action:()=>Promise<T>):Promise<T>{
 const previous=uploadQueues.get(projectId)||Promise.resolve(),result=previous.catch(()=>{}).then(action);
 uploadQueues.set(projectId,result);void result.finally(()=>{if(uploadQueues.get(projectId)===result)uploadQueues.delete(projectId);}).catch(()=>{});return result;
}
async function uploadJournal(projectId:string){
 const key='uploads:'+projectId;let raw=await request('featureGet',{key});const rows:Upload[]=raw?JSON.parse(raw):[];
 return {rows,save:async(upload:Upload)=>{upload.revision=crypto.randomUUID();const value=JSON.stringify(rows);await request('featureSet',{key,expected:raw,value});raw=value;}};
}
function uploadBinding(project:Project,upload?:Upload):UploadBinding{
 if(!project.remote.worldId)throw new Error('Create or download a Voyage draft first.');
 const environment=project.remote.environment||'production';
 if(upload&&(upload.projectId!==project.id||upload.environment!==environment||upload.shortId!==project.remote.worldId))throw new Error('Upload project/environment/world binding is missing or changed. Review the original upload; it cannot be retargeted.');
 return {projectId:project.id,environment,worldId:project.remote.worldId};
}
async function repairUpload(upload:Upload,asset?:Asset){
 if(!upload.imageUrl)throw new Error('Ready upload is missing its approved URL. Review the recorded upload.');
 await registerRemote(upload.imageUrl,'image',asset?.name||'Uploaded image',{target:upload.target,state:'existing',environment:upload.environment,uploadId:upload.uploadId},upload.assetId);return upload;
}
async function repairCompletedUpload(project:Project,upload:Upload,save:(upload:Upload)=>Promise<void>,asset?:Asset){
 const binding=uploadBinding(project);
 if(upload.projectId===undefined||upload.environment===undefined){
  const compatibleWorld=upload.shortId===binding.worldId&&(upload.projectId===undefined||upload.projectId===binding.projectId)&&(upload.environment===undefined||upload.environment===binding.environment);
  const catalog=await library(),entry=catalog.find(item=>item.kind==='image'&&item.storageId===upload.assetId);
  const evidence=entry?.remote.some(remote=>remote.url===upload.imageUrl&&remote.target===upload.target&&remote.environment===binding.environment&&remote.state!=='reserved'&&(!remote.uploadId||!upload.uploadId||remote.uploadId===upload.uploadId));
  if(upload.state!=='ready'||upload.step!=='done'||!compatibleWorld||!evidence)throw new Error('Completed upload binding is missing or changed and has no compatible library evidence. Review the original upload; it cannot be retargeted.');
  upload.projectId=binding.projectId;upload.environment=binding.environment;await save(upload);
 }
 uploadBinding(project,upload);return repairUpload(upload,asset);
}
export function prepareUpload(p:Project,target:string,asset:Asset){return serializeUpload(p.id,()=>prepareImageUpload(p,target,asset));}
async function prepareImageUpload(p:Project,target:string,asset:Asset){
 p=(await request('project',{id:p.id})).project;const binding=uploadBinding(p);
 if(!p.remote.worldId)throw new Error('Create or download a Voyage draft first.');
 if(!Object.prototype.hasOwnProperty.call(imageTargets,target))throw new Error('Unknown upload target.');
 const journal=await uploadJournal(p.id),rows=journal.rows,matching=rows.filter(row=>row.assetId===asset.id&&row.target===target);
 const pending=matching.find(row=>!['ready','expired'].includes(row.state)||row.bytesAttempted!==false&&row.state==='expired');
 if(pending)throw new Error('Resume the existing upload for this image. Its outcome must be resolved before another allowance.');
 const ready=matching.find(row=>row.state==='ready'||row.step==='done');
 if(ready)return repairCompletedUpload(p,ready,journal.save,asset);
 const catalog=await library(),entry=catalog.find(item=>item.storageId===asset.id);
 const remote=entry&&(reusableRemote({...entry,remote:entry.remote.filter(reference=>reference.environment===binding.environment)},target)||reusableRemote({...entry,remote:entry.remote.filter(reference=>!reference.environment)},target));
 if(remote){const reused:Upload={id:crypto.randomUUID(),projectId:p.id,environment:binding.environment,shortId:p.remote.worldId,target,assetId:asset.id,mimeType:entry!.mime,width:0,height:0,state:'ready',step:'done',imageUrl:remote.url,created:Date.now()};rows.unshift(reused);await journal.save(reused);return reused;}
 const info=await imageInfo(asset.dataUrl),base64=asset.dataUrl.split(',')[1];
 if(base64.length*3/4>5*1024*1024||info.width<600||info.height<600)throw new Error('Voyage requires at least 600 × 600 pixels and at most 5 MiB.');
 const upload:Upload={id:crypto.randomUUID(),projectId:p.id,environment:binding.environment,shortId:p.remote.worldId,target,assetId:asset.id,mimeType:info.mimeType,width:info.width,height:info.height,state:'prepared',step:'allowance',bytesAttempted:false,created:Date.now()};rows.unshift(upload);await journal.save(upload);return upload;
}
export function sendUpload(p:Project,id:string){return serializeUpload(p.id,()=>sendImageUpload(p,id));}
async function sendImageUpload(p:Project,id:string){
 const journal=await uploadJournal(p.id),upload=journal.rows.find(row=>row.id===id);if(!upload)throw new Error('Upload not found.');
 const latest=(await request('project',{id:p.id})).project as Project;
 const asset=await feature<Asset|null>('asset:'+upload.assetId,null);
 if(upload.state==='ready'||upload.step==='done')return repairCompletedUpload(latest,upload,journal.save,asset||undefined);
 const binding=uploadBinding(latest,upload);
 if(Date.now()-upload.created>23*60*60*1000)throw new Error('Recorded upload replay window expired. Review its outcome before starting another.');
 try{
  while(upload.step!=='done'){
   upload.state='sending';await journal.save(upload);
   if(upload.step==='allowance'){
    const response=(await creator('POST','/uploads',JSON.stringify({target:upload.target,width:upload.width,height:upload.height,mimeType:upload.mimeType}),'image-allowance-'+upload.id,binding)).data,data=response.data||response;
    if(!data.uploadId||!data.directUploadUrl)throw new Error('Incomplete upload allowance.');
    upload.uploadId=data.uploadId;upload.directUploadUrl=data.directUploadUrl;upload.expiresAt=data.expiresAt;upload.step='bytes';
   }else if(upload.step==='bytes'){
    if(upload.bytesAttempted){upload.step='moderation';}
    else{
     if(upload.expiresAt&&Date.parse(upload.expiresAt)<=Date.now()){upload.state='expired';throw new Error('Signed upload URL expired before any bytes were sent.');}
     if(!asset)throw new Error('Source image missing.');
     upload.bytesAttempted=true;await journal.save(upload);
     await request('signedUpload',{...binding,url:upload.directUploadUrl,mime:upload.mimeType,base64:asset.dataUrl.split(',')[1]});upload.step='moderation';
    }
   }else if(upload.step==='moderation'){
    const response=(await creator('POST','/worlds/'+encodeURIComponent(upload.shortId)+'/uploads/'+encodeURIComponent(upload.uploadId!)+'/moderate',JSON.stringify({target:upload.target}),'image-moderation-'+upload.id,binding)).data,data=response.data||response;
    if(!data.imageUrl||!/^https:\/\//.test(data.imageUrl))throw new Error('Image moderation has not returned an approved image URL.');
    upload.imageUrl=data.imageUrl;upload.step='done';upload.state='ready';delete upload.error;
   }else throw new Error('Invalid upload step.');
   await journal.save(upload);
  }
  return await repairUpload(upload,asset||undefined);
 }catch(error){
  if(upload.state!=='expired'&&upload.step!=='done')upload.state='unknown';
  upload.error=upload.bytesAttempted&&upload.step!=='done'?'Upload bytes may have been accepted. Resume this exact upload to recover through moderation; if unresolved, inspect it in Voyage before another allowance. '+(error as Error).message:(error as Error).message;
  await journal.save(upload);throw new Error(upload.error);
 }
}
