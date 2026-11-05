import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from './store';
import {Service} from './service';
import {project as fixture,references} from '../../tests/creation-fixture';
import {creationArtifactSpecs} from '../../packages/core/world-creation';
import {hash} from '../../packages/core/project';
import {inspectMedia} from '../../packages/core/asset-library';
import {uploadCreationAssets,creationPackage} from '../../apps/workbench/src/creation-execution';
import {publicationAction} from '../../apps/workbench/src/features-api';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=';
test('source/design/job checkpoints survive desktop store restart even without a live text task',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-creation-store-'));let store=new Store(directory);
 try{
  const project=fixture();store.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(project.id,project.name,1,1,JSON.stringify(project));
  const spec=creationArtifactSpecs(project.creation!,project.activeSource,hash)[0];store.dispatch(project.id,{type:'creationJobStart',baseHash:hash(project.activeSource),expectedRevision:project.creation!.revision,id:spec.id,specHash:spec.specHash,attempt:'running-artifact'});
  store.close();store=new Store(directory);store.recover();const saved=store.project(project.id);
  assert.equal(saved.creation!.documents[0].hash,project.creation!.documents[0].hash);assert.deepEqual(saved.creation!.maps,project.creation!.maps);assert.equal(saved.creation!.jobs[0].state,'uncertain');assert.equal(saved.tasks.length,0);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test('creation uploads resume exact recorded requests, assign URLs and never save or publish the world',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-creation-upload-')),previousWindow=(globalThis as any).window,previousImage=(globalThis as any).Image;
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 let allowances=0,puts=0,moderations=0,loseResponse=true;
 try{
  const project=fixture();project.remote={environment:'alpha',worldId:'DRAFT',etag:'revision',baselineHash:'',operations:[]};
  for(const spec of creationArtifactSpecs(project.creation!,project.activeSource,hash)){
   const assetId=crypto.randomUUID();service.store.setting('feature:asset:'+assetId,JSON.stringify({id:assetId,created:1,dataUrl:png,prompt:spec.prompt,name:spec.label}));
   project.creation!.jobs.push({id:spec.id,specHash:spec.specHash,state:'ready',attempt:spec.id,assetId,assetHash:inspectMedia(png).sha256,created:1});
  }
  service.store.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(project.id,project.name,1,1,JSON.stringify(project));
  (globalThis as any).Image=class {naturalWidth=1000;naturalHeight=1000;src='';async decode(){}};
  (globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>{if(method==='signedUpload'){puts++;return {};}return service.request(method,payload);}}};
  service.voyage=async(method,endpoint)=>{
   assert.equal(method,'POST');
   if(endpoint==='/uploads'){allowances++;return {text:JSON.stringify({data:{uploadId:'upload-'+allowances,directUploadUrl:'https://example.com/upload',expiresAt:new Date(Date.now()+300000).toISOString()}}),etag:''};}
   if(endpoint.includes('/moderate')){moderations++;if(loseResponse){loseResponse=false;throw Error('Lost moderation response');}return {text:JSON.stringify({data:{imageUrl:'https://latitude-standard-pull-zone-1.b-cdn.net/'+endpoint.split('/')[4]+'.png'}}),etag:''};}
   throw Error('Unexpected remote world mutation '+endpoint);
  };
  await assert.rejects(uploadCreationAssets(project.id,()=>{}),/Lost moderation response/);assert.equal(allowances,1);assert.equal(puts,1);
  await uploadCreationAssets(project.id,()=>{});assert.equal(allowances,2);assert.equal(puts,2);assert.equal(moderations,3);
  const saved=service.store.project(project.id);assert.ok(saved.creation!.jobs.every(job=>job.url));assert.match(saved.activeSource,/9007199254740993/);assert.match(saved.activeSource,/b-cdn.net/);
  await uploadCreationAssets(project.id,()=>{});assert.equal(allowances,2);assert.equal(puts,2);
  const bundle=await creationPackage(saved,references);assert.equal(bundle.worldSource,saved.activeSource);assert.equal(bundle.assets.length,2);assert.ok(bundle.creationDetails.image);assert.equal(bundle.readiness.state,'blocked');
 }finally{(globalThis as any).window=previousWindow;(globalThis as any).Image=previousImage;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('normal publication workflow blocks unfinished creation packages before any remote publish request',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-creation-publish-')),previous=(globalThis as any).window;
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});let remoteCalls=0;
 try{
  const project=fixture();project.remote.worldId='DRAFT';service.store.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(project.id,project.name,1,1,JSON.stringify(project));service.references=references;
  service.voyage=async()=>{remoteCalls++;throw Error('No network permitted');};(globalThis as any).window={voyage:{invoke:(method:string,payload:any)=>service.request(method,payload)}};
  await assert.rejects(publicationAction(project,'publish'),/not release-ready/);assert.equal(remoteCalls,0);
 }finally{(globalThis as any).window=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
