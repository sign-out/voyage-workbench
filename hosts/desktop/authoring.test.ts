import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';
test('authoring proposals, bookmarks and checkpoint labels survive reopen without cross-project access',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-authoring-')),secrets={durable:false,get:()=>'',set:()=>{}};let service=new Service(directory,path.resolve('apps/workbench/public/references'),secrets);
 try{
  const source='{"shortId":"fixed","initialGameState":{"npcs":{"m":{"name":"M","exact":9007199254740993}}}}',project=(await service.request('create',{name:'Audit fixture',source})).project,id=project.id,entry=['initialGameState','npcs','m'];
  await service.request('featureSet',{key:'readiness:'+id,value:JSON.stringify({hash:hash(source),valid:true,stage:'publish',created:1})});assert.equal(JSON.parse(await service.request('featureGet',{key:'readiness:'+id})).stage,'publish');
  const tileBatch=JSON.stringify({masterId:'master',realm:'Earth',columns:12,rows:12,createMissing:true,tiles:[]});
  await service.request('featureSet',{key:'region-map-slices:'+id,value:tileBatch});
  assert.equal(await service.request('featureGet',{key:'region-map-slices:'+id}),tileBatch);
  await assert.rejects(()=>service.request('featureSet',{key:'region-map-slices:'+id,value:'{}',expected:'stale'}),/changed/);
  await assert.rejects(()=>service.request('featureGet',{key:'region-map-slices:../escape'}),/Invalid feature key/);
  await service.request('command',{id,command:{type:'bookmark',id:'bookmark',name:'M',path:entry,baseHash:hash(source)}});
  await service.request('command',{id,command:{type:'authoringProposal',id:'copy',operation:'duplicate',path:entry,newKey:'copy',baseHash:hash(source)}});assert.equal(service.store.project(id).activeSource,source);
  await service.request('command',{id,command:{type:'accept',id:'copy'}});const checkpoint=(await service.request('history',{id}))[0],detail=await service.request('checkpointDetail',{id,checkpointId:checkpoint.id});assert.equal(detail.source,source);
  await service.request('renameCheckpoint',{id,checkpointId:checkpoint.id,label:'Before copying M'});assert.equal((await service.request('history',{id}))[0].label,'Before copying M');
  const other=(await service.request('create',{name:'Other',source:'{}'})).project;await assert.rejects(()=>service.request('checkpointDetail',{id:other.id,checkpointId:checkpoint.id}),/not found/);await assert.rejects(()=>service.request('renameCheckpoint',{id:other.id,checkpointId:checkpoint.id,label:'bad'}),/not found/);await assert.rejects(()=>service.request('renameCheckpoint',{id,checkpointId:checkpoint.id,label:' '}),/label/);
  service.store.close();service=new Service(directory,path.resolve('apps/workbench/public/references'),secrets);assert.equal(service.store.project(id).bookmarks?.[0].name,'M');assert.match(service.store.project(id).activeSource,/9007199254740993/);assert.equal((await service.request('checkpointDetail',{id,checkpointId:checkpoint.id})).source,source);
  await service.request('restore',{id,checkpointId:checkpoint.id});const restored=service.store.project(id);assert.match(restored.activeSource,/"copy"/);assert.equal(restored.candidates[0].kind,'checkpoint');assert.equal((await service.request('exportHistory',{id})).project.bookmarks[0].name,'M');
  service.store.setting('providers',JSON.stringify({profiles:[{id:'old',name:'Insecure old profile',protocol:'openai',baseUrl:'http://remote.example/v1',model:'model'}],routes:{}}));await assert.rejects(()=>service.request('providerModels',{profileId:'old'}),/require HTTPS/);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
