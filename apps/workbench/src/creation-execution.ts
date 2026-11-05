import {hash,type Project} from '../../../packages/core/project';
import {creationArtifactSpecs,creationBriefHash,creationWorldHash,creationInputHash,creationDestinations} from '../../../packages/core/world-creation';
import {creationMapSvg,mapRegion} from '../../../packages/core/creation-map';
import {resolveRoute,type TaskRoute} from '../../../packages/core/providers';
import {inspectMedia} from '../../../packages/core/asset-library';
import {creationArchiveLimits} from '../../../packages/core/creation-transfer';
import {request} from './host';
import {saveAsset,feature,prepareUpload,sendUpload,type Asset,type Upload} from './features-api';

export interface CreationDependencies {
 invoke:typeof request;saveAsset:typeof saveAsset;renderMap:(source:string,project:Project,regionKey:string)=>Promise<string>;
 id:()=>string;onProject?:(result:any)=>void;
}
export async function renderCreationRegion(source:string,project:Project,regionKey:string){
 if(!project.creation)throw new Error('No geographic blueprint.');
 const {map,column,row}=mapRegion(source,project.creation.maps,regionKey),svg=creationMapSvg(map,{column,row,columns:1,rows:1});
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1000;
  const context=canvas.getContext('2d');if(!context)throw new Error('Map rasterization is unavailable.');
  context.drawImage(image,0,0,1000,1000);return canvas.toDataURL('image/png');
 }finally{URL.revokeObjectURL(url);}
}
const defaults:CreationDependencies={invoke:request,saveAsset,renderMap:renderCreationRegion,id:()=>crypto.randomUUID()};
export async function generateCreationAssets(projectId:string,approval:{route?:TaskRoute;maximumImages:number;acknowledgeRetry?:boolean},dependencies:CreationDependencies=defaults){
 const {invoke}=dependencies;
 if(!Number.isSafeInteger(approval.maximumImages)||approval.maximumImages<0||approval.maximumImages>100)throw new Error('Approve a maximum of 0–100 image requests.');
 const initial=(await invoke('project',{id:projectId})).project as Project;
 if(!initial.creation)throw new Error('No creation workspace.');
 const briefHash=creationBriefHash(initial.creation,hash),worldHash=creationWorldHash(initial.activeSource,hash);
 const specs=creationArtifactSpecs(initial.creation,initial.activeSource,hash);let imageRequests=0;
 const dispatch=async(command:any)=>{const result=await invoke('command',{id:projectId,command});dependencies.onProject?.(result);return result;};
 for(const spec of specs){
  const current=(await invoke('project',{id:projectId})).project as Project,workspace=current.creation;
  if(!workspace||creationBriefHash(workspace,hash)!==briefHash||creationWorldHash(current.activeSource,hash)!==worldHash)throw new Error('The source or world changed. Review a fresh asset batch.');
  const liveSpec=creationArtifactSpecs(workspace,current.activeSource,hash).find(item=>item.id===spec.id);
  if(!liveSpec||liveSpec.specHash!==spec.specHash)throw new Error('An artwork brief or map changed. Review a fresh batch.');
  const previous=workspace.jobs.find(job=>job.id===spec.id);
  if(previous?.state==='ready'&&previous.specHash===spec.specHash)continue;
  if(previous?.state==='running')throw new Error('Another asset worker owns this job.');
  if(previous&&['uncertain','failed'].includes(previous.state)&&!approval.acknowledgeRetry)continue;
  if(spec.kind==='image'){
   if(imageRequests>=approval.maximumImages)continue;
   if(!approval.route)throw new Error('Select and approve an Artwork provider before generating images.');
   const effective=resolveRoute((await invoke('providerSettings')).settings,'artwork');
   if(JSON.stringify(effective)!==JSON.stringify(approval.route))throw new Error('The Artwork provider changed. Review a fresh batch; no fallback was used.');
  }
  const attempt=dependencies.id();
  await dispatch({type:'creationJobStart',baseHash:hash(current.activeSource),expectedRevision:workspace.revision,id:spec.id,specHash:spec.specHash,attempt,routeHash:spec.kind==='image'?hash(JSON.stringify(approval.route)):undefined,acknowledgeRetry:approval.acknowledgeRetry===true});
  let sent=false;
  try{
   let dataUrl:string,route:any;
   if(spec.kind==='map')dataUrl=await dependencies.renderMap(current.activeSource,current,spec.regionKey!);
   else {sent=true;imageRequests++;const generated=await invoke('imageGenerate',{prompt:spec.prompt,route:approval.route});dataUrl=generated.dataUrl;route=generated.route;}
   const asset=await dependencies.saveAsset({dataUrl,name:spec.label+' · creation',prompt:spec.prompt,route});
   await dispatch({type:'creationJobFinish',id:spec.id,attempt,state:'ready',assetId:asset.id,assetHash:inspectMedia(dataUrl).sha256});
  }catch(error){
   const message=(sent?'The provider may have completed this request. No automatic retry. ':'')+(error as Error).message;
   try{await dispatch({type:'creationJobFinish',id:spec.id,attempt,state:sent?'uncertain':'failed',error:message});}catch{}
   throw new Error(message);
  }
 }
 return {imageRequests};
}
export async function uploadCreationAssets(projectId:string,onProject:(result:any)=>void){
 const initial=(await request('project',{id:projectId})).project as Project;
 if(!initial.creation||!initial.remote.worldId)throw new Error('Create or link a Voyage draft in Publish before uploading.');
 const initialWorld=creationWorldHash(initial.activeSource,hash),initialBrief=creationBriefHash(initial.creation,hash),worldId=initial.remote.worldId;
 const specs=creationArtifactSpecs(initial.creation,initial.activeSource,hash);
 for(const spec of specs){
  const current=(await request('project',{id:projectId})).project as Project;
  if(!current.creation||current.remote.worldId!==worldId||creationWorldHash(current.activeSource,hash)!==initialWorld||creationBriefHash(current.creation,hash)!==initialBrief)throw new Error('The linked world or creation inputs changed. Review uploads.');
  const liveSpec=creationArtifactSpecs(current.creation,current.activeSource,hash).find(item=>item.id===spec.id&&item.specHash===spec.specHash),job=current.creation.jobs.find(job=>job.id===spec.id&&job.specHash===spec.specHash&&job.state==='ready');
  if(!liveSpec||!job?.assetId)continue;
  if(job.url)continue;
  const asset=await feature<Asset|null>('asset:'+job.assetId,null);if(!asset||inspectMedia(asset.dataUrl).sha256!==job.assetHash)throw new Error('A generated asset is missing or changed.');
  const destination=creationDestinations(current.activeSource).find(destination=>destination.id===spec.destinationId);
  if(!destination?.target)throw new Error('Artwork destination changed.');
  const recorded=(await feature<Upload[]>('uploads:'+projectId,[])).find(upload=>upload.assetId===asset.id&&upload.target===destination.target&&upload.shortId===worldId&&upload.state!=='expired');
  const upload=recorded||await prepareUpload(current,destination.target,asset),completed=upload.state==='ready'?upload:await sendUpload(current,upload.id);
  if(!completed.imageUrl)throw new Error('Image moderation has not supplied an approved URL.');
  const latest=(await request('project',{id:projectId})).project as Project;
  if(!latest.creation||creationWorldHash(latest.activeSource,hash)!==initialWorld||creationBriefHash(latest.creation,hash)!==initialBrief||latest.remote.worldId!==worldId)throw new Error('World changed during upload; image preserved without assignment.');
  onProject(await request('command',{id:projectId,command:{type:'creationJobUrl',id:spec.id,baseHash:hash(latest.activeSource),url:completed.imageUrl}}));
 }
}
export async function creationPackage(project:Project,references:any[]){
 if(!project.creation)throw new Error('No creation workspace.');
 const {creationReadiness}=await import('../../../packages/core/world-creation');
 const specs=creationArtifactSpecs(project.creation,project.activeSource,hash);
 if(specs.length>creationArchiveLimits.artifacts)throw new Error('A creation package supports at most 612 current map/artwork artifacts. Export the world separately.');
 const workspace={...project.creation,jobs:project.creation.jobs.filter(job=>specs.some(spec=>spec.id===job.id))};
 const assets:Asset[]=[];let artworkBytes=0;
 for(const spec of specs){
  const job=project.creation.jobs.find(job=>job.id===spec.id&&job.specHash===spec.specHash&&job.state==='ready');
  if(job?.assetId){const asset=await feature<Asset|null>('asset:'+job.assetId,null);if(!asset||inspectMedia(asset.dataUrl).sha256!==job.assetHash)throw new Error('A required local asset is missing or changed.');if(!assets.some(saved=>saved.id===asset.id)){artworkBytes+=inspectMedia(asset.dataUrl).bytes;if(artworkBytes>creationArchiveLimits.artworkBytes)throw new Error('A restorable package supports at most 96 MiB of unique artwork. Export the world separately or reduce image sizes.');assets.push(asset);}}
 }
 const bundle={format:'voyage-workbench-creation-package/v1',worldSource:project.activeSource,creationDetails:creationDetails(project),creation:workspace,assets,readiness:creationReadiness(workspace,project.activeSource,references,hash),inputHash:creationInputHash(workspace,project.activeSource,hash),notice:'Workbench archive of current creation artifacts, not a Voyage world import or a full job-history backup. Export world JSON separately. No publication has been performed.'};
 if(new Blob([JSON.stringify(bundle)]).size>creationArchiveLimits.archiveBytes)throw new Error('A restorable creation package must be at most 128 MiB. Export the world separately or reduce image sizes.');
 return bundle;
}
export function creationDetails(project:Project){
 const workspace=project.creation;if(!workspace)throw new Error('No creation workspace.');
 const cover=creationArtifactSpecs(workspace,project.activeSource,hash).find(spec=>spec.destinationId==='creation-cover');
 const job=cover&&workspace.jobs.find(job=>job.id===cover.id&&job.specHash===cover.specHash&&job.state==='ready');
 return {title:workspace.publication.title,description:workspace.publication.blurb,advancedDescription:workspace.publication.description,tags:workspace.publication.tags,image:job?.url||''};
}
