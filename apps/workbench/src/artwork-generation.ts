import {hash,type Project} from '../../../packages/core/project';
import type {ArtworkProposal} from '../../../packages/core/artwork-requests';
import {resolveRoute,type TaskRoute} from '../../../packages/core/providers';
import {saveAsset,type Asset} from './features-api';
import {request} from './host';

export interface Generation {id:string;created:number;destination:string;destinationId?:string;proposalId?:string;prompt:string;state:string;assetId?:string;error?:string}
type Dependencies={request:typeof request;saveAsset:typeof saveAsset;id:()=>string;now:()=>number};
const defaults:Dependencies={request,saveAsset,id:()=>crypto.randomUUID(),now:()=>Date.now()};
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
 const job:Generation={id:dependencies.id(),created:dependencies.now(),destination:proposal.label,destinationId:proposal.destinationId,proposalId:proposal.id,prompt:proposal.prompt,state:'generating'};
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
