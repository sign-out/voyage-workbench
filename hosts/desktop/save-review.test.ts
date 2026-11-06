import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';

function fixture(){
 const quests:Record<string,any>={},triggers:Record<string,any>={};
 for(let index=0;index<50;index++){
  const name='Quest '+index,condition={type:'story',query:'Complete objective '+index};
  quests[name]={name,completionCondition:condition};
  const id='__generated_quest_progress__/'+name;
  triggers[id]={name:id,recurring:false,conditions:[condition],effects:[{type:'quest-progress',questId:name}]};
 }
 const state={heroesVersion:37,compatibilityRevision:16,unassignedAreas:{},worldVoices:{},parties:{'':{quests,questTriggers:{}}}};
 const normalized={heroesVersion:37,compatibilityRevision:16,parties:{'':{quests,questTriggers:triggers}},characterCreationMusic:'fantasy'};
 const envelope=(value:any)=>'{"shortId":"WORLD","title":"Synthetic world","initialGameState":'+JSON.stringify(value)+',"creationNotes":"Local only"}';
 return {source:envelope(state),remote:envelope(normalized)};
}
test('53 normalization differences can be reviewed, adopted and reopened without a second PUT',async()=>{
 const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-save-review-')),original=globalThis.fetch,resources=path.resolve('apps/workbench/public/references'),secrets={durable:false,get:()=> 'test-key',set:()=>{}};
 let service=new Service(folder,resources,secrets),writes=0,reads=0;
 const {source,remote}=fixture();
 try{
  const {project}=await service.request('create',{source});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"old"',envelopeSource:source});
  globalThis.fetch=async(url,options)=>{
   assert.match(String(url),/^https:\/\/api-alpha\.aidungeon\.com/);
   if(String(url).endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[]}}');
   if(options?.method==='PUT'){writes++;assert.equal((options.headers as any)['If-Match'],'"old"');return new Response('{}');}
   reads++;return new Response('{"data":{"world":'+remote+'}}',{headers:{etag:'W/"normalized"'}});
  };
  await service.request('saveRemote',{id:project.id});
  let current=service.store.project(project.id);assert.equal(current.remote.operations[0].comparison.total,53);assert.equal(current.remote.operations[0].state,'UNKNOWN');
  await service.request('saveRemote',{id:project.id});assert.equal(writes,1);
  const proposal=await service.request('reviewRemoteSave',{id:project.id});current=proposal.project;
  assert.equal(current.activeSource,source);assert.equal(current.candidates.length,1);assert.equal(current.remote.operations[0].state,'UNKNOWN');assert.equal(writes,1);
  const accepted=await service.request('command',{id:project.id,command:{type:'accept',id:current.candidates[0].id}});
  assert.equal(accepted.project.remote.operations[0].state,'ACCEPTED');assert.equal(accepted.project.remote.etag,'W/"normalized"');assert.equal(accepted.project.remote.baselineHash,hash(accepted.project.activeSource));
  assert.equal(accepted.project.activeSource,remote);assert.equal(writes,1);assert.equal(reads,3);
  assert.ok(service.store.history(project.id).some((entry:any)=>entry.label==='Before accepting proposal'));
  service.store.close();service=new Service(folder,resources,secrets);
  const restored=service.store.project(project.id);assert.equal(restored.remote.operations[0].state,'ACCEPTED');assert.equal(restored.activeSource,remote);assert.equal(writes,1);
 }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
test('review refuses late local edits and snapshots without a revision, leaving the save unresolved',async()=>{
 const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-save-review-stale-')),original=globalThis.fetch;
 const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}}),{source,remote}=fixture();
 try{
  const {project}=await service.request('create',{source});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"old"'});
  service.store.dispatch(project.id,{type:'savePrepare',id:'save',baseHash:hash(source),payload:'{"world":'+source+'}'});service.store.dispatch(project.id,{type:'saveState',id:'save',state:'SEND_ATTEMPTED'});
  globalThis.fetch=async(_url,options)=>{assert.equal(options?.method,'GET');return new Response('{"data":{"world":'+remote+'}}');};
  await assert.rejects(service.request('reviewRemoteSave',{id:project.id}),/invalid world revision/);
  assert.equal(service.store.project(project.id).candidates.length,0);
  globalThis.fetch=async(_url,options)=>{assert.equal(options?.method,'GET');service.store.dispatch(project.id,{type:'edit',path:['title'],source:'"Newer local"',baseHash:hash(source)});return new Response('{"data":{"world":'+remote+'}}',{headers:{etag:'"new"'}});};
  await assert.rejects(service.request('reviewRemoteSave',{id:project.id}),/world changed/);
  const current=service.store.project(project.id);assert.match(current.activeSource,/Newer local/);assert.equal(current.candidates.length,0);assert.equal(current.remote.operations[0].state,'SEND_ATTEMPTED');
 }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
