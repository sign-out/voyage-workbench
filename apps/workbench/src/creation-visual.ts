import {hash,type Project} from '../../../packages/core/project';
import {creationArtifactSpecs,creationVisualHash,creationUnresolvedVisualFindings} from '../../../packages/core/world-creation';
import {creationVisualBatchSize,creationVisualRoute,type CreationVisualImage,type CreationVisualResult} from '../../../packages/core/creation-visual';
import {inspectMedia} from '../../../packages/core/asset-library';
import type {TaskRoute} from '../../../packages/core/providers';
import {request} from './host';
import {feature,imageInfo,type Asset} from './features-api';

export async function creationVisualPreview(dataUrl:string){
 const {image,width,height}=await imageInfo(dataUrl),scale=Math.min(1,768/Math.max(width,height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const context=canvas.getContext('2d');if(!context)throw new Error('Visual preview rendering is unavailable.');
 context.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
type VisualDependencies={invoke:typeof request;loadAsset:(id:string)=>Promise<Asset|null>;preview:(dataUrl:string)=>Promise<string>;onProject?:(result:any)=>void;shouldStop?:()=>boolean};
const defaults:VisualDependencies={invoke:request,loadAsset:id=>feature<Asset|null>('asset:'+id,null),preview:creationVisualPreview};
export async function reviewCreationVisuals(projectId:string,approval:{route:TaskRoute;maximumBatches:number},dependencies:VisualDependencies=defaults){
 if(!Number.isSafeInteger(approval.maximumBatches)||approval.maximumBatches<0||approval.maximumBatches>153)throw new Error('Approve a bounded visual-review request count.');
 const {invoke}=dependencies,initial=(await invoke('project',{id:projectId})).project as Project,workspace=initial.creation;
 if(!workspace)throw new Error('No creation workspace.');
 const inputHash=creationVisualHash(workspace,initial.activeSource,hash),routeHash=hash(JSON.stringify(approval.route)),specs=creationArtifactSpecs(workspace,initial.activeSource,hash);
 if(!specs.length)throw new Error('Plan and finish the package artwork first.');
 const specById=new Map(specs.map(spec=>[spec.id,spec]));
 const load=async(project:Project,id:string)=>{
  const spec=specById.get(id),job=project.creation!.jobs.find(job=>job.id===id&&job.specHash===spec?.specHash&&job.state==='ready');
  if(!job?.assetId||!job.assetHash)throw new Error('Complete every required map and artwork job before visual review.');
  const asset=await dependencies.loadAsset(job.assetId);if(!asset||inspectMedia(asset.dataUrl).sha256!==job.assetHash)throw new Error('Saved visual evidence is missing or changed.');
  return {asset,assetHash:job.assetHash};
 };
 for(const spec of specs)await load(initial,spec.id);
 const saved=workspace.visualProgress?.inputHash===inputHash&&workspace.visualProgress.routeHash===routeHash?workspace.visualProgress.reports:[],reports:CreationVisualResult[]=saved.slice(),reviewed=new Set(saved.flatMap(report=>report.assets.map(asset=>asset.id))),pending=specs.filter(spec=>!reviewed.has(spec.id));
 if(Math.ceil(pending.length/creationVisualBatchSize)>approval.maximumBatches)throw new Error('The remaining visual review exceeds the approved request count.');
 let requests=0;
 for(let offset=0;offset<pending.length;offset+=creationVisualBatchSize){
  if(dependencies.shouldStop?.())throw new Error('Visual review stopped. Completed batch findings are saved; approve continuation explicitly.');
  const current=(await invoke('project',{id:projectId})).project as Project;
  if(!current.creation||creationVisualHash(current.creation,current.activeSource,hash)!==inputHash)throw new Error('The visual package changed. Approve a fresh review.');
  creationVisualRoute((await invoke('providerSettings')).settings,approval.route);
  const images:CreationVisualImage[]=[];
  for(const spec of pending.slice(offset,offset+creationVisualBatchSize)){const {asset,assetHash}=await load(current,spec.id);images.push({id:spec.id,assetHash,dataUrl:await dependencies.preview(asset.dataUrl)});}
  let result:any;
  try{requests++;result=await invoke('creationVisualGrade',{id:projectId,inputHash,route:approval.route,images});}
  catch(error){throw new Error((error as Error).message+' The reviewer may have consumed usage. No automatic retry was sent; saved prior batches remain available.');}
  const committed=await invoke('command',{id:projectId,command:{type:'creationVisualBatch',inputHash,routeHash,ids:images.map(image=>image.id),report:result.report}});dependencies.onProject?.(committed);reports.push(result.report);
 }
 const current=(await invoke('project',{id:projectId})).project as Project;
 if(!current.creation||creationVisualHash(current.creation,current.activeSource,hash)!==inputHash)throw new Error('The visual package changed. Approve a fresh review.');
 const findings=reports.flatMap(report=>report.assets),outstanding=creationUnresolvedVisualFindings(current.creation,current.activeSource,hash),previousOutcome=current.creation.visualReview?.inputHash===inputHash?current.creation.visualReview.outcome:undefined,statuses=[previousOutcome,...findings.map(asset=>asset.status),...outstanding.map(asset=>asset.status)],outcome=statuses.includes('fail')?'fail':statuses.includes('uncertain')?'uncertain':'pass';
 const report=JSON.stringify({method:'model-pixel-review',outcome,assetsReviewed:findings.length,batches:reports.length,route:approval.route,detailsSection:'visualProgress',detailsHash:hash(JSON.stringify(reports)),summaries:reports.slice(0,40).map(report=>report.summary.slice(0,300)),repairs:findings.filter(asset=>asset.status!=='pass').slice(0,40).map(asset=>({id:asset.id.slice(0,200),status:asset.status,fix:asset.fix.slice(0,600)})),limitations:'768px previews; bounded source excerpts; model findings, not objective canon proof, full-resolution inspection, rubric certification or official acceptance.'});
 const result=await invoke('command',{id:projectId,command:{type:'creationVisualReview',scope:'all-required-assets',inputHash,report,outcome}});dependencies.onProject?.(result);
 return {requests,outcome,report,project:result.project};
}
