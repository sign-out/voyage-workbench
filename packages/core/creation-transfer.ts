import {createWorkspace,updateCreation,creationArtifactSpecs,type CreationWorkspace} from './world-creation';
export const creationArchiveLimits={artifacts:612,archiveBytes:128*1024*1024,artworkBytes:96*1024*1024};

export function prepareCreationTransfer(input:CreationWorkspace,source:string,hasher:(value:string)=>string,id:string):CreationWorkspace {
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new Error('Restored creation needs a valid fresh ID.');
 if(!input||input.version!==1||!Array.isArray(input.documents)||!Array.isArray(input.jobs)||input.jobs.length>creationArchiveLimits.artifacts)throw new Error('Unsupported creation workspace archive.');
 const documents=input.documents.map(document=>{
  if(!document||document.hash!==hasher(document.text))throw new Error('A research document hash does not match its archived text.');
  return {id:document.id,name:document.name,text:document.text};
 });
 let restored=createWorkspace({id:input.id,brief:input.brief,documents,profile:input.profile},hasher);
 for(const section of ['design','publication','maps','artwork'] as const){
  if(JSON.stringify(input[section])===JSON.stringify(restored[section]))continue;
  restored=updateCreation(restored,section,JSON.stringify(input[section]),source,hasher,0);
 }
 const previousSpecs=creationArtifactSpecs(restored,source,hasher);
 restored={...restored,id,revision:1};
 const nextSpecs=creationArtifactSpecs(restored,source,hasher),seen=new Set<string>();
 for(const job of input.jobs){
  if(!job||typeof job.id!=='string'||seen.has(job.id))throw new Error('Archived artifact jobs must have unique IDs.');
  seen.add(job.id);
  const previous=previousSpecs.find(spec=>spec.id===job.id&&spec.specHash===job.specHash),next=nextSpecs.find(spec=>spec.id===job.id);
  if(!previous||!next)continue;
  if(['running','uncertain','failed'].includes(job.state)){restored.jobs.push({id:job.id,specHash:next.specHash,state:job.state==='failed'?'failed':'uncertain',attempt:'restored',created:0,error:'Imported an incomplete request. The provider may already have completed it; inspect saved assets before explicitly authorizing a retry.'});continue;}
  if(job.state!=='ready')throw new Error('Unsupported archived artifact state.');
  if(typeof job.assetId!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(job.assetId)||typeof job.assetHash!=='string'||!/^[a-f0-9]{64}$/.test(job.assetHash))throw new Error('Completed archived jobs need saved asset IDs and hashes.');
  restored.jobs.push({id:job.id,specHash:next.specHash,state:'ready',attempt:'restored',assetId:job.assetId,assetHash:job.assetHash,created:0});
 }
 return restored;
}
