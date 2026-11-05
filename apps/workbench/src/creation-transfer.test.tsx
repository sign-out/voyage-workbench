import test from 'node:test';
import assert from 'node:assert/strict';
import {create,hash,reduce} from '../../../packages/core/project';
import {creationArtifactSpecs,creationInputHash} from '../../../packages/core/world-creation';
import {inspectMedia} from '../../../packages/core/asset-library';
import {project as fixture,references} from '../../../tests/creation-fixture';
import {inspectCreationArchive,restoreCreationArchive} from './creation-transfer';
import {createWorldCopy} from './features-api';
import {creationPackage} from './creation-execution';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=';
function archive(){
 const project=fixture(),assets=creationArtifactSpecs(project.creation!,project.activeSource,hash).map((spec,index)=>({id:'asset-'+index,created:1,prompt:spec.prompt,dataUrl:png}));
 project.creation!.jobs=creationArtifactSpecs(project.creation!,project.activeSource,hash).map((spec,index)=>({id:spec.id,specHash:spec.specHash,state:'ready',attempt:'done',assetId:assets[index].id,assetHash:inspectMedia(png).sha256,url:'https://example.com/old.png',created:1}));
 return {format:'voyage-workbench-creation-package/v1',worldSource:project.activeSource,creation:project.creation!,assets,inputHash:creationInputHash(project.creation!,project.activeSource,hash)};
}
test('creation archive restores exact-number source, canon, map plan and artwork into a fresh unlinked project',async()=>{
 const original=archive(),calls:string[]=[];let saved=0,project=create('new','Restored',original.worldSource,1);
 const restored=await restoreCreationArchive(JSON.stringify(original),{id:()=>'new-creation',saveAsset:async data=>({...data,id:'new-asset-'+ ++saved,created:1}),invoke:async(method,payload)=>{calls.push(method);if(method==='create'){project=create('new',payload.name,payload.source,1);return {project};}if(method==='command'){project=reduce(project,payload.command);return {project};}throw Error('Unexpected remote request');}});
 assert.deepEqual(calls,['create','command']);assert.equal(saved,2);assert.equal(restored.project.activeSource,original.worldSource);assert.match(restored.project.activeSource,/9007199254740993/);
 assert.equal(restored.project.creation.jobs.length,2);assert.ok(restored.project.creation.jobs.every((job:any)=>job.assetId.startsWith('new-asset-')&&!job.url));assert.equal(restored.project.remote.worldId,'');assert.equal(restored.project.creation.sourceReads,undefined);
});
test('archive preflight rejects mismatched research, missing/corrupt images and incorrect input hashes before any writes',async()=>{
 for(const kind of ['research','missing-image','image-bytes','input-hash']){
  const bundle=archive();if(kind==='research')bundle.creation.documents[0].text+='tampered';if(kind==='missing-image')bundle.assets.pop();if(kind==='image-bytes')bundle.assets[0].dataUrl='data:image/png;base64,aW52YWxpZA==';if(kind==='input-hash')bundle.inputHash=hash('wrong');
  let writes=0;await assert.rejects(restoreCreationArchive(JSON.stringify(bundle),{id:()=>'new',invoke:async()=>{writes++;},saveAsset:async()=>{writes++;throw Error('Unexpected write');}}));assert.equal(writes,0);
 }
 assert.throws(()=>inspectCreationArchive('{"heroesVersion":37}'),/creation package/);
});
test('save-as-new carries the creation workspace and existing local assets without copying remote authority',async()=>{
 const bundle=archive(),original=fixture();original.creation=bundle.creation;original.remote.worldId='ORIGINAL';
 const previous=(globalThis as any).window,calls:string[]=[],assets=new Map(bundle.assets.map(asset=>['asset:'+asset.id,JSON.stringify(asset)]));let copy:any;
 (globalThis as any).window={voyage:{invoke:async(method:string,payload:any)=>{
  calls.push(method);if(method==='project')return {project:original};if(method==='featureGet')return assets.get(payload.key)||'';if(method==='featureSet'){assets.set(payload.key,payload.value);return {};}
  if(method==='create'){copy=create('copy',payload.name,payload.source,1);return {project:copy};}if(method==='command'){copy=reduce(copy,payload.command);return {project:copy};}throw Error('Unexpected '+method);
 }}};
 try{const result=await createWorldCopy(original);assert.equal(result.project.creation.jobs.length,2);assert.deepEqual(result.project.creation.documents,original.creation.documents);assert.equal(result.project.remote.worldId,'');assert.notEqual(result.project.creation.id,original.creation.id);assert.equal(original.remote.worldId,'ORIGINAL');assert.ok(calls.every(method=>['project','featureGet','featureSet','create','command'].includes(method)));}
 finally{(globalThis as any).window=previous;}
});
test('shared images export once, legacy identical duplicates restore, and conflicting duplicate IDs are rejected',async()=>{
 const bundle=archive(),project=fixture();bundle.creation.jobs[1].assetId=bundle.assets[0].id;bundle.assets[1]={...bundle.assets[0]};bundle.inputHash=creationInputHash(bundle.creation,bundle.worldSource,hash);project.creation=bundle.creation;
 assert.equal(inspectCreationArchive(JSON.stringify(bundle)).assets.size,1);
 const previous=(globalThis as any).window;(globalThis as any).window={voyage:{invoke:async(method:string)=>{assert.equal(method,'featureGet');return JSON.stringify(bundle.assets[0]);}}};
 try{const exported=await creationPackage(project,references);assert.equal(exported.assets.length,1);assert.equal(inspectCreationArchive(JSON.stringify(exported)).creation.jobs.length,2);}finally{(globalThis as any).window=previous;}
 bundle.assets[1]={...bundle.assets[0],dataUrl:png.replace('O+jf','O+kg')};assert.throws(()=>inspectCreationArchive(JSON.stringify(bundle)),/Conflicting/);
});
test('package exports omit removed-artifact history rather than creating an archive the importer cannot restore',async()=>{
 const bundle=archive(),project=fixture();project.creation=bundle.creation;for(let index=0;index<700;index++)project.creation.jobs.push({...project.creation.jobs[0],id:'obsolete-'+index});
 const previous=(globalThis as any).window;(globalThis as any).window={voyage:{invoke:async(method:string,payload:any)=>{assert.equal(method,'featureGet');return JSON.stringify(bundle.assets.find(asset=>'asset:'+asset.id===payload.key));}}};
 try{const exported=await creationPackage(project,references);assert.equal(exported.creation.jobs.length,2);assert.equal(inspectCreationArchive(JSON.stringify(exported)).creation.jobs.length,2);assert.equal(project.creation.jobs.length,702);}finally{(globalThis as any).window=previous;}
});
