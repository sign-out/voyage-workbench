import {request} from './host';
import {creator,feature} from './features-api';
import {assetData,registerRemote} from './asset-library';
import {reusableRemote,type LibraryAsset} from '../../../packages/core/asset-library';
import {mediaUrl} from '../../../packages/core/studio';
export type MusicUpload={id:string;assetId:string;storageId:string;mime:string;created:number;step:'allowance'|'bytes'|'finalize'|'done';state:'prepared'|'sending'|'unknown'|'ready'|'expired';uploadId?:string;directUploadUrl?:string;expiresAt?:string;musicUrl?:string;reservationExpiresAt?:number;error?:string;leaseUntil?:number};
const key='music-uploads';
export async function musicUploads(){return feature<MusicUpload[]>(key,[]);}
export async function acknowledgeExpiredMusicUpload(id:string){
 const result=await update(rows=>rows.map(row=>{if(row.id!==id)return row;if((row.leaseUntil||0)>Date.now())throw new Error('Upload is active.');if(row.state!=='expired'&&Date.now()-row.created<=23*60*60*1000)throw new Error('Resume the existing upload while its replay window is available.');return {...row,state:'expired',error:'Expired operation retained after explicit outcome inspection. A new upload consumes another allowance.'};}));
 await request('forgetUploadUrl',{id});return result;
}
async function update(change:(rows:MusicUpload[])=>MusicUpload[]){
 const raw=await request('featureGet',{key}),rows=change(raw?JSON.parse(raw):[]);
 await request('featureSet',{key,expected:raw,value:JSON.stringify(rows)});return rows;
}
export async function uploadMusic(asset:LibraryAsset,resumeId?:string){
 if(asset.kind!=='audio'||!asset.storageId)throw new Error('Choose local audio bytes from the library.');
 if(!resumeId){const remote=reusableRemote(asset);if(remote)return remote.url;}
 const stored=await assetData(asset);
 let operation:MusicUpload;
 await update(rows=>{
  if(resumeId){const found=rows.find(row=>row.id===resumeId&&row.assetId===asset.id);if(!found)throw new Error('Recorded music upload not found.');if((found.leaseUntil||0)>Date.now())throw new Error('This upload is active. Wait for it to finish before resuming.');operation={...found};}
  else{if(rows.some(row=>row.assetId===asset.id&&row.state!=='expired'&&!(row.step==='done'&&!!row.reservationExpiresAt&&row.reservationExpiresAt<=Date.now())))throw new Error('Resume the recorded upload instead of requesting another allowance.');if(rows.length>=5000)throw new Error('Music journal limit reached.');operation={id:crypto.randomUUID(),assetId:asset.id,storageId:asset.storageId!,mime:asset.mime,created:Date.now(),step:'allowance',state:'prepared'};rows.unshift(operation);}
  if(Date.now()-operation.created>23*60*60*1000)throw new Error('Replay window expired. Keep the recorded URL and inspect the remote outcome before a new upload.');
  delete operation.directUploadUrl;operation.leaseUntil=Date.now()+120000;operation.state='sending';return rows.map(row=>row.id===operation.id?operation:row);
 });
 const current=operation!;
 const persist=()=>update(rows=>rows.map(row=>row.id===current.id?{...current}:row));
 try{
  while(current.step!=='done'){
   current.leaseUntil=Date.now()+120000;await persist();
   if(current.step==='allowance'){
    const reply=(await creator('POST','/uploads/music',JSON.stringify({mimeType:current.mime}),'music-allowance-'+current.id)).data,data=reply.data||reply;
    if(!data.uploadId||!data.directUploadUrl||!data.expiresAt)throw new Error('Music allowance response is incomplete.');
    await request('retainUploadUrl',{id:current.id,url:data.directUploadUrl});current.uploadId=data.uploadId;current.expiresAt=data.expiresAt;current.step='bytes';
   }else if(current.step==='bytes'){
    if(!current.expiresAt||!Number.isFinite(Date.parse(current.expiresAt))||Date.parse(current.expiresAt)<=Date.now()){current.step='finalize';await persist();continue;}
    if(!(await request('hasUploadUrl',{id:current.id})).available){const reply=(await creator('POST','/uploads/music',JSON.stringify({mimeType:current.mime}),'music-allowance-'+current.id)).data,data=reply.data||reply;if(data.uploadId!==current.uploadId||!data.directUploadUrl)throw new Error('Exact allowance replay did not return the original upload.');await request('retainUploadUrl',{id:current.id,url:data.directUploadUrl});}await request('signedUpload',{uploadToken:current.id,mime:current.mime,base64:stored.dataUrl.split(',')[1]});current.step='finalize';
   }else{
    const reply=(await creator('POST','/uploads/music/'+encodeURIComponent(current.uploadId!)+'/finalize','{}','music-finalize-'+current.id)).data,data=reply.data||reply;
    if(typeof data.musicUrl!=='string')throw new Error('Finalization has not returned a music URL.');
    current.musicUrl=mediaUrl(data.musicUrl);current.reservationExpiresAt=data.expiresAt?Date.parse(data.expiresAt):current.created+24*60*60*1000;current.step='done';current.state='ready';
   }
   await persist();
  }
  await registerRemote(current.musicUrl!,'audio',asset.name,{state:'reserved',expiresAt:current.reservationExpiresAt,environment:'alpha',uploadId:current.uploadId},asset.storageId);
  await request('forgetUploadUrl',{id:current.id});current.error='';current.state='ready';return current.musicUrl!;
 }catch(error){current.state=/HTTP 404\b/.test((error as Error).message)&&current.step==='finalize'?'expired':'unknown';current.error=(error as Error).message;throw error;}
 finally{current.leaseUntil=0;await persist();if(current.state==='expired')await request('forgetUploadUrl',{id:current.id});}
}
