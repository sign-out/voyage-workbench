import {hash,type Project} from '../../../packages/core/project';
import type {ArtworkProposal} from '../../../packages/core/artwork-requests';
import {resolveRoute,type TaskRoute} from '../../../packages/core/providers';
import {saveAsset,type Asset} from './features-api';
import {request} from './host';
import type {ArtworkDestination} from '../../../packages/core/artwork';
import type {ArtworkActivity} from './ArtworkProgress';

export interface Generation {id:string;created:number;destination:string;destinationId?:string;proposalId?:string;prompt:string;state:string;assetId?:string;error?:string;provider?:string;model?:string}
type Dependencies={request:typeof request;saveAsset:typeof saveAsset;id:()=>string;now:()=>number};
const defaults:Dependencies={request,saveAsset,id:()=>crypto.randomUUID(),now:()=>Date.now()};
const localRequests=new Set<string>();
type LocalArtworkOptions={project:Project;destination:ArtworkDestination;prompt:string;reference?:Asset;proposalId?:string;current:()=>Project|null;assertCurrent?:()=>void;onActivity?:(activity:ArtworkActivity)=>void;onHistory?:(jobs:Generation[])=>void;onJob?:(job:Generation)=>void};
/** Shared by the full studio and direct actions. Navigation is never a side effect. */
export async function generateLocalArtwork(options:LocalArtworkOptions,dependencies:Dependencies&{confirm?:(message:string)=>boolean}=defaults):Promise<Asset|undefined>{
 const {project,destination,prompt,reference,proposalId}=options,source=project.activeSource,invoke=dependencies.request,key='artwork-studio:'+project.id,lock=project.id+':'+destination.id;
 if(localRequests.has(lock))throw new Error('Artwork is already generating for '+destination.label+'. Wait for its result.');
 localRequests.add(lock);
 try{
  const assertCurrent=()=>{const current=options.current();if(!current||current.id!==project.id||current.activeSource!==source||current.draft||current.status&&current.status!=='active')throw new Error('The world changed or has unapplied edits. Review the destination again.');options.assertCurrent?.();};
  assertCurrent();if(!prompt.trim())throw new Error('Describe the artwork first.');
  const started=dependencies.now();
  options.onActivity?.({destination:destination.label,purpose:destination.category,started,phase:'preparing'});
  const route=resolveRoute((await invoke('providerSettings')).settings,'artwork');
  options.onActivity?.({destination:destination.label,purpose:destination.category,started,phase:'preparing',provider:route.name,model:route.model});
  const raw=await invoke('featureGet',{key}),history:Generation[]=raw?JSON.parse(raw):[];
  const previous=history.some(job=>job.destinationId===destination.id&&['generating','uncertain'].includes(job.state));
  if(!(dependencies.confirm||((message:string)=>window.confirm(message)))('Generate one image for '+destination.label+' ('+destination.category+') using '+route.name+' · '+(route.model||'provider default')+'? The brief'+(reference?' and selected reference image':'')+' will be sent to this provider and may incur charges. '+(previous?'A previous request for this destination has an unconfirmed outcome; another request may charge again. Inspect its history first. ':'')+'This saves artwork locally only; nothing is uploaded or attached automatically.'))return;
  assertCurrent();
  const job:Generation={id:dependencies.id(),created:started,destination:destination.label,destinationId:destination.id,...(proposalId?{proposalId}:{}),prompt,state:'generating',provider:route.name,model:route.model};
  const persist=async(reserve=false)=>{const jobs=await saveGeneration(key,job,invoke,reserve);options.onHistory?.(jobs);};
  await persist(!!proposalId);options.onJob?.(job);
  let sent=false;
  try{
   assertCurrent();
   const effective=resolveRoute((await invoke('providerSettings')).settings,'artwork');
   if(JSON.stringify(effective)!==JSON.stringify(route))throw new Error('The Artwork provider or model changed. Review the connection and approve again.');
   assertCurrent();
   options.onActivity?.({destination:destination.label,purpose:destination.category,started,phase:'generating',provider:route.name,model:route.model});sent=true;
   const result=await invoke('imageGenerate',{prompt,route,...(reference?{referenceDataUrl:reference.dataUrl}:{})},{label:'Generating artwork for '+destination.label+' · '+route.name+' · '+(route.model||'configured default'),projectId:project.id});
   options.onActivity?.({destination:destination.label,purpose:destination.category,started,phase:'saving',provider:route.name,model:route.model});
   const saved=await dependencies.saveAsset({dataUrl:result.dataUrl,prompt,name:destination.label+' · '+destination.category,route:result.route});
   job.assetId=saved.id;job.state='generated';await persist();return saved;
  }catch(reason){
   job.state=sent?'uncertain':'blocked';job.error=destination.label+': '+(sent?'The provider may have completed this request. No automatic retry. ':'No image request was sent. ')+(reason as Error).message;
   try{await persist();}catch{}
   throw new Error(job.error);
  }
 }finally{localRequests.delete(lock);}
}
export async function saveGeneration(key:string,job:Generation,invoke:typeof request=request,reserve=false){
 for(let attempt=0;attempt<4;attempt++){
  const raw=await invoke('featureGet',{key}),rows:Generation[]=raw?JSON.parse(raw):[];
  if(reserve&&rows.some(row=>row.proposalId===job.proposalId))throw new Error('This artwork request already has a generation attempt. Review its history instead of sending it again.');
  const next=[job,...rows.filter(row=>row.id!==job.id)];
  try{await invoke('featureSet',{key,expected:raw,value:JSON.stringify(next)});return next;}
  catch(error){if(!/This feature changed/.test((error as Error).message)||attempt===3)throw error;}
 }
 throw new Error('Artwork history changed. Reload before continuing.');
}
export async function generateApprovedArtwork(projectId:string,proposal:ArtworkProposal,route:TaskRoute,onHistory:(jobs:Generation[])=>void,dependencies:Dependencies=defaults):Promise<Asset>{
 const invoke=dependencies.request,key='artwork-studio:'+projectId;
 const check=async()=>{
  const current=(await invoke('project',{id:projectId})).project as Project;
  const saved=current.artworkProposals?.find(item=>item.id===proposal.id);
  if(current.id!==projectId||current.draft||current.status&&current.status!=='active'||hash(current.activeSource)!==proposal.baseHash||!saved||saved.baseHash!==proposal.baseHash||saved.destinationId!==proposal.destinationId||saved.prompt!==proposal.prompt)throw new Error('This artwork request or world changed. Review a fresh request before approving generation.');
  const effective=resolveRoute((await invoke('providerSettings')).settings,'artwork');
  if(JSON.stringify(effective)!==JSON.stringify(route))throw new Error('The Artwork provider or model changed. Refresh approvals before generating.');
 };
 await check();
 const job:Generation={id:dependencies.id(),created:dependencies.now(),destination:proposal.label,destinationId:proposal.destinationId,proposalId:proposal.id,prompt:proposal.prompt,state:'generating',provider:route.name,model:route.model};
 onHistory(await saveGeneration(key,job,invoke,true));
 let sent=false;
 try{
  await check();sent=true;
  const result=await invoke('imageGenerate',{prompt:proposal.prompt,route});
  const asset=await dependencies.saveAsset({dataUrl:result.dataUrl,prompt:proposal.prompt,name:proposal.label+' · assistant artwork',route:result.route});
  job.assetId=asset.id;job.state='generated';
  onHistory(await saveGeneration(key,job,invoke));return asset;
 }catch(error){
  job.state=sent?'uncertain':'blocked';job.error=(sent?'The provider may have completed this request. No automatic retry. ':'No image request was sent. ')+(error as Error).message;
  try{onHistory(await saveGeneration(key,job,invoke));}catch{}
  throw new Error(job.error);
 }
}
