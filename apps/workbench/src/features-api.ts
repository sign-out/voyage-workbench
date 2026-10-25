import {request} from './host';import * as doc from '../../../packages/core/document';import {hash,remotePayload,type Project} from '../../../packages/core/project';
import {feature,saveFeature} from './feature-store';
export {feature,saveFeature} from './feature-store';
import {importLocal,library,registerRemote} from './asset-library';
import {reusableRemote} from '../../../packages/core/asset-library';
import {imageTargets} from '../../../packages/core/artwork';
import {voyageCleanRejection,voyageRetryAfter} from '../../../packages/core/voyage-api';
export interface UploadBinding {projectId:string;environment:string;worldId:string}
export async function creator(method:string,endpoint:string,body?:string,idempotencyKey?:string,binding?:UploadBinding){const r=await request('creatorRequest',{method,endpoint,body,idempotencyKey,...binding});return {...r,data:JSON.parse(r.text)};}
export const worldSource=(source:string)=>doc.read(source,doc.statePath(doc.parse(source)).slice(0,-1));
export async function validateSource(source:string,stage='draft'){if(!['draft','publish'].includes(stage))throw new Error('Validation stage must be draft or publish.');return (await creator('POST','/validate','{"stage":'+JSON.stringify(stage)+',"world":{"initialGameState":'+doc.read(source,doc.statePath(doc.parse(source)))+'}}')).data;}
export const valid=(report:any)=>{const result=report?.data??report;return result?.valid===true&&Array.isArray(result.errors)&&result.errors.length===0;};
export function privateDraft(p:Project,creationDetails='{}'){
 const path=doc.statePath(doc.parse(p.activeSource)),fields:Record<string,string>={title:JSON.stringify(p.name),visibility:'"private"',initialGameState:doc.read(p.activeSource,path)};
 if(path.length){const parent=doc.at(doc.parse(p.activeSource),path.slice(0,-1));for(const key of ['title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags'])if(parent.children.some(child=>child.key===key))fields[key]=doc.read(p.activeSource,path.slice(0,-1).concat(key));}
 else{const details=doc.parse(creationDetails);if(details.kind!=='object')throw new Error('Creation details must be an object.');for(const child of details.children){const key=String(child.key);if(!['title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags'].includes(key))throw new Error('Unsupported creation detail: '+key);fields[key]=creationDetails.slice(child.node.start,child.node.end);}}
 return '{"world":{'+Object.keys(fields).map(key=>JSON.stringify(key)+':'+fields[key]).join(',')+'}}';
}
export interface PublicationOperation {id:string;kind:string;worldId:string;body:string;sourceHash:string;created:number;state:string;result?:any;detail?:string;environment?:string;apiBase?:string;expectedEtag?:string;owner?:string;sentAt?:number;retryAt?:number;retryBlocked?:boolean}
export const pendingPublication=(operation:PublicationOperation)=>!['CONFIRMED','REJECTED'].includes(operation.state);
export function publicationCooldown(operation:PublicationOperation,now=Date.now()){
 if(operation.retryBlocked)return 'Voyage supplied an unreadable cooldown. Confirm the cooldown with Voyage before replaying.';
 return operation.retryAt&&operation.retryAt>now?'Retry no earlier than '+new Date(operation.retryAt).toISOString()+'.':'';
}
function publicationFailure(message:string,now=Date.now()){
 const transport=message.replace(/^Error invoking remote method 'workbench': Error: (?=Voyage HTTP \d{3}(?: \([a-zA-Z0-9_-]+\))?:)/,'');
 const match=/^Voyage HTTP (\d{3})(?: \(([a-zA-Z0-9_-]+)\))?:/.exec(transport),status=Number(match?.[1]||0),code=match?.[2]||'';
 if(!match)return {state:'UNKNOWN',retryAt:undefined,retryBlocked:false};
 const absolute=/Retry no earlier than (\d{4}-\d{2}-\d{2}T[\d:.]+Z)\./.exec(transport),header=/ Retry-After: (.+?)\.(?: |$)/.exec(transport);
 const delay=absolute?Date.parse(absolute[1])-now:header?voyageRetryAfter(header[1],now):undefined;
 const retryBlocked=delay===Infinity||message.includes('invalid cooldown')||message.includes('Invalid server cooldown');
 const retryAt=delay!==undefined&&Number.isFinite(delay)?now+Math.max(0,delay):undefined;
 const clean=!!match&&voyageCleanRejection(status,code);
 return {state:clean?(code==='studio_unavailable'||status===429?'RETRYABLE':'REJECTED'):'UNKNOWN',retryAt,retryBlocked};
}
async function publicationJournal(projectId:string){
 const key='publication:'+projectId;let raw=await request('featureGet',{key});const rows:PublicationOperation[]=raw?JSON.parse(raw):[];
 return {rows,save:async()=>{const value=JSON.stringify(rows);await request('featureSet',{key,expected:raw,value});raw=value;}};
}
const publicationQueues=new Map<string,Promise<unknown>>();
export async function createWorldCopy(project:Project){
 const current=(await request('project',{id:project.id})).project as Project;
 if(current.draft||current.tasks.some(task=>['PREPARED','RUNNING'].includes(task.state)))throw new Error('Apply/discard the draft and finish the agent before creating a new world.');
 if(current.remote.operations.some(operation=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(operation.state)))throw new Error('Reconcile the pending save before creating a new world.');
 const publication=await feature<PublicationOperation[]>('publication:'+current.id,[]);
 if(publication.some(pendingPublication))throw new Error('Resolve the recorded publication request before creating another world. Use the publication journal.');
 const details=await feature<string>('creation-details:'+current.id,'{}');
 const copy=await request('create',{name:current.name+' — new world',source:current.activeSource});
 await saveFeature('creation-details:'+copy.project.id,details);
 return copy;
}
export function publicationAction(project:Project,kind:string,retry?:PublicationOperation,inspectOnly=false){
 if(publicationQueues.has(project.id))return Promise.reject(new Error('This project already has a publication action in progress. Wait for its journal result.'));
 const next=runPublication(project,kind,retry,inspectOnly);publicationQueues.set(project.id,next);
 void next.finally(()=>{if(publicationQueues.get(project.id)===next)publicationQueues.delete(project.id);}).catch(()=>{});return next;
}
async function runPublication(project:Project,kind:string,retry?:PublicationOperation,inspectOnly=false){
 let current=(await request('project',{id:project.id})).project as Project;
 const journal=await publicationJournal(project.id),ops=journal.rows;
 let op:PublicationOperation;
 if(retry){const found=ops.find(row=>row.id===retry.id);if(!found)throw new Error('Recorded request not found.');op=found;kind=op.kind;}
 else{
  if(ops.some(pendingPublication))throw new Error('Resolve the recorded publication request before starting another. Use the publication journal; do not create a new key.');
  if(!['create','publish','unpublish','moderation'].includes(kind))throw new Error('Unsupported publication action.');
  const connection=await request('connection');
  op={id:crypto.randomUUID(),kind,worldId:current.remote.worldId,body:kind==='create'?privateDraft(current,await feature<string>('creation-details:'+current.id,'{}')):kind==='moderation'?'{"forceFullCheck":false}':'{}',sourceHash:hash(current.activeSource),created:Date.now(),state:'PREPARED',environment:connection.environment,apiBase:connection.apiBase,expectedEtag:current.remote.etag};ops.unshift(op);
 }
 if(op.state==='CONFIRMED')return ops;
 if(op.state==='REJECTED')throw new Error('Voyage rejected this operation before any effect. Correct the problem and start a new action; do not replay this completed rejection.');
 const acknowledged=()=>op.state==='ACKNOWLEDGED'||op.result!==undefined;
 const assertHost=async()=>{const connection=await request('connection');if(!op.environment||!op.apiBase||connection.environment!==op.environment||connection.apiBase!==op.apiBase||current.remote.environment&&current.remote.environment!==op.environment)throw new Error('Publication environment is missing or changed. Restore the original selected host; do not replay on another environment. Alpha 1.3 and production 1.2 contracts may differ.');};
 await assertHost();
 if(!acknowledged()&&!inspectOnly){
  const cooldown=publicationCooldown(op);if(cooldown)throw new Error(cooldown);
  if(['SEND_ATTEMPTED','UNKNOWN'].includes(op.state)&&Date.now()-(op.sentAt??op.created)>=24*60*60*1000)throw new Error('The protected replay window expired. Inspect the remote outcome and contact Voyage support; this unresolved operation still blocks new keys.');
 }
 op.owner=crypto.randomUUID();await journal.save();
 let sending=false,received=acknowledged();const previousState=op.state;
 try{
  if(inspectOnly&&!received){
   if(!op.worldId)throw new Error('Creation outcome is unknown. Inspect owned worlds in the original environment; do not create another world or key.');
   await assertHost();await creator('GET','/worlds/'+encodeURIComponent(op.worldId));
   op.detail='Remote draft read successfully. This does not prove publication convergence or a failed request. The original key remains reserved.';await journal.save();return ops;
  }
  if(!received){
   const assertSource=async()=>{
    current=(await request('project',{id:project.id})).project as Project;await assertHost();
    if(current.draft||current.tasks.some(task=>['PREPARED','RUNNING'].includes(task.state)))throw new Error('Apply/discard the draft and finish the agent before publication.');
    if(current.remote.operations.some(operation=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].includes(operation.state)))throw new Error('Reconcile the remote save first.');
    if(hash(current.activeSource)!==op.sourceHash||current.remote.worldId!==op.worldId||current.remote.etag!==op.expectedEtag)throw new Error('The source, linked world or revision changed since this request was prepared. Inspect the original outcome; do not replay or replace an ambiguous request.');
    if(kind==='create'&&privateDraft(current,await feature<string>('creation-details:'+current.id,'{}'))!==op.body)throw new Error('Creation details changed. Do not replay the old request against changed content.');
   };
   await assertSource();
   if(kind==='create'){
    if(op.worldId)throw new Error('This project already has a linked draft.');
    if(!valid(await validateSource(current.activeSource)))throw new Error('Official draft validation must pass first.');
   }else{
    if(!op.worldId)throw new Error('Create or download a Voyage draft first.');
    const remote=await creator('GET','/worlds/'+encodeURIComponent(op.worldId)),source=worldSource(remote.text);
    if(!remote.etag||op.expectedEtag!==remote.etag||doc.diff(remotePayload(current.activeSource),remotePayload(source)).total)throw new Error('Save and review the current Voyage draft before publication. The recorded revision no longer matches; no mutation was sent.');
    if(kind==='publish'&&!valid(await validateSource(source,'publish')))throw new Error('Publish validation did not pass.');
   }
   await request('checkpoint',{id:project.id,label:'Before Voyage '+kind});await assertSource();
   op.state='SEND_ATTEMPTED';op.sentAt=previousState==='RETRYABLE'?Date.now():op.sentAt??Date.now();await journal.save();
   sending=true;
   const response=await request('creatorRequest',{method:'POST',endpoint:kind==='create'?'/worlds':'/worlds/'+encodeURIComponent(op.worldId)+'/'+kind,body:op.body,idempotencyKey:op.id});
   sending=false;received=true;op.state='ACKNOWLEDGED';op.result=response.text.trim()?JSON.parse(response.text):null;delete op.retryAt;delete op.retryBlocked;await journal.save();
  }
  await assertHost();
  if(kind==='create'){
   const data=op.result?.data||op.result,world=data?.world||data;
   if(!world?.shortId)throw new Error('Voyage acknowledged creation but returned no world ID. Inspect owned worlds; do not submit creation again.');
   op.worldId=world.shortId;await journal.save();
   current=(await request('project',{id:project.id})).project as Project;
   if(current.remote.worldId&&current.remote.worldId!==op.worldId)throw new Error('Project linked elsewhere since creation. Inspect created world '+op.worldId+' in the original environment.');
   if(hash(current.activeSource)!==op.sourceHash||current.draft)throw new Error('World '+op.worldId+' was created. Local content changed; open that world separately rather than replacing your edits.');
   await assertHost();await request('downloadWorld',{id:project.id,worldId:op.worldId});
  }else await creator('GET','/worlds/'+encodeURIComponent(op.worldId));
  op.state='CONFIRMED';op.detail=kind==='create'?'Draft created. Review the downloaded envelope in Proposals.':'Voyage acknowledged the action; draft read back.';await journal.save();return ops;
 }catch(error){
  const detail=(error as Error).message;
  if(received)op.state='ACKNOWLEDGED';
  else if(sending)Object.assign(op,publicationFailure(detail));
  else op.state=!inspectOnly&&['PREPARED','RETRYABLE'].includes(previousState)?'REJECTED':previousState;
  op.detail=detail;await journal.save();throw error;
 }
}
export async function imageInfo(dataUrl:string){if(!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl))throw new Error('Choose PNG, JPEG, or WebP.');const decoded=atob(dataUrl.split(',')[1]),bytes=decoded.slice(0,12);const mimeType=bytes.startsWith('\x89PNG\r\n\x1a\n')?'image/png':bytes.startsWith('\xff\xd8\xff')?'image/jpeg':bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'?'image/webp':'';if(!mimeType)throw new Error('Image bytes must be PNG, JPEG, or WebP.');const image=new Image();image.src=dataUrl;await image.decode();if(image.naturalWidth*image.naturalHeight>64000000)throw new Error('Image exceeds the local 64-megapixel safety limit (not a Voyage API limit).');return {width:image.naturalWidth,height:image.naturalHeight,mimeType,image,byteLength:decoded.length};}
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
 const info=await imageInfo(asset.dataUrl),minimum=target==='WORLD_COVER'?1:600;
 if(info.byteLength>5*1024*1024||info.width<minimum||info.height<minimum)throw new Error(target==='WORLD_COVER'?'Voyage covers require positive dimensions and at most 5 MiB.':'Voyage gameplay images require at least 600 × 600 pixels and at most 5 MiB.');
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
