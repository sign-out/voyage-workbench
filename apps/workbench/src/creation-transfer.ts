import {hash,type Project} from '../../../packages/core/project';
import {parse} from '../../../packages/core/document';
import {prepareCreationTransfer,creationArchiveLimits} from '../../../packages/core/creation-transfer';
import {creationInputHash,type CreationWorkspace} from '../../../packages/core/world-creation';
import {inspectMedia} from '../../../packages/core/asset-library';
import {request} from './host';
import {feature,saveAsset,type Asset} from './features-api';

export interface CreationArchive {
 format:'voyage-workbench-creation-package/v1';worldSource:string;creation:CreationWorkspace;assets:Asset[];inputHash:string;
}
type TransferDependencies={invoke:typeof request;saveAsset:typeof saveAsset;id:()=>string};
const defaults:TransferDependencies={invoke:request,saveAsset,id:()=>crypto.randomUUID()};
export function inspectCreationArchive(raw:string){
 if(raw.length>creationArchiveLimits.archiveBytes||new Blob([raw]).size>creationArchiveLimits.archiveBytes)throw new Error('Creation archives must be at most 128 MiB.');
 const archive=JSON.parse(raw) as CreationArchive;
 if(!archive||archive.format!=='voyage-workbench-creation-package/v1'||typeof archive.worldSource!=='string'||!Array.isArray(archive.assets)||archive.assets.length>creationArchiveLimits.artifacts)throw new Error('Choose a Workbench creation package, not a Voyage world export.');
 parse(archive.worldSource);
 const creation=prepareCreationTransfer(archive.creation,archive.worldSource,hash,archive.creation.id);
 if(archive.inputHash!==creationInputHash(archive.creation,archive.worldSource,hash))throw new Error('Creation package inputs do not match the archived hash.');
 const assets=new Map<string,Asset>();let bytes=0;
 for(const asset of archive.assets){
  if(!asset||typeof asset.id!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(asset.id))throw new Error('Archived assets need valid local IDs.');
  const media=inspectMedia(asset.dataUrl),previous=assets.get(asset.id);
  if(previous){if(inspectMedia(previous.dataUrl).sha256!==media.sha256)throw new Error('Conflicting archived images share the same local ID.');continue;}
  bytes+=media.bytes;
  if(media.kind!=='image'||bytes>creationArchiveLimits.artworkBytes)throw new Error('Creation artwork must be images totalling at most 96 MiB.');
  assets.set(asset.id,asset);
 }
 for(const job of creation.jobs.filter(job=>job.state==='ready'))if(!assets.has(job.assetId!)||inspectMedia(assets.get(job.assetId!)!.dataUrl).sha256!==job.assetHash)throw new Error('A completed artifact is missing or its image bytes changed.');
 return {archive,creation,assets};
}
export async function restoreCreationArchive(raw:string,dependencies:TransferDependencies=defaults){
 const {archive,creation,assets}=inspectCreationArchive(raw),restored={...creation,jobs:creation.jobs.map(job=>({...job}))},ids=new Map<string,string>();
 for(const job of restored.jobs.filter(job=>job.state==='ready')){
  if(!ids.has(job.assetId!)){
   const asset=assets.get(job.assetId!)!,saved=await dependencies.saveAsset({dataUrl:asset.dataUrl,prompt:typeof asset.prompt==='string'?asset.prompt.slice(0,12000):'',name:'Restored creation artwork'});
   ids.set(job.assetId!,saved.id);
  }
  job.assetId=ids.get(job.assetId!);
 }
 const created=await dependencies.invoke('create',{name:creation.publication.title||'Restored creation',source:archive.worldSource});
 return dependencies.invoke('command',{id:created.project.id,command:{type:'restoreCreation',baseHash:hash(archive.worldSource),workspace:restored,creationId:dependencies.id()}});
}
export async function copyCreationWorkspace(source:Project){
 if(!source.creation)throw new Error('No creation workspace to copy.');
 const workspace=prepareCreationTransfer(source.creation,source.activeSource,hash,source.creation.id);
 for(const job of workspace.jobs.filter(job=>job.state==='ready')){const asset=await feature<Asset|null>('asset:'+job.assetId,null);if(!asset||inspectMedia(asset.dataUrl).sha256!==job.assetHash)throw new Error('Creation artwork is missing or changed; repair it before copying.');}
 const destination=(await request('create',{name:source.name+' — new world',source:source.activeSource})).project as Project;
 return request('command',{id:destination.id,command:{type:'restoreCreation',baseHash:hash(destination.activeSource),workspace,creationId:crypto.randomUUID()}});
}
