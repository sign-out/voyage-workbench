import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from './store';
import {hash} from '../../packages/core/project';
import {dispatchWorldTool} from './world-tools';

test('journaled section checkpoints commit once, use host storage, and roll back their receipts on storage failure',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-journaled-sections-')),store=new Store(directory);
 const source='{"heroesVersion":37,"title":"Before","description":"Original"}';
 try{
  const id=store.create('Journaled sections',source).project!.id;
  store.dispatch(id,{type:'workOrder',baseHash:hash(source),order:{reviewedScope:true,objective:'Improve title and description',requirements:[],allowedPaths:[['title'],['description']]}});
  store.dispatch(id,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work'});
  store.dispatch(id,{type:'taskRunning',taskId:'task',attempt:'attempt'});
  const call=(callId:string,name:string,args:any)=>dispatchWorldTool(store,id,'task','attempt',callId,name,args);
  call('edit-title','world_edit',{action:'replace',path:['title'],source:'"After"'});
  const first=call('checkpoint-title','world_checkpoint',{label:'Title',paths:[['title']]});
  assert.equal(first.checkpoint.sequence,1);assert.equal(store.history(id).length,1);
  assert.deepEqual(call('checkpoint-title','world_checkpoint',{label:'Title',paths:[['title']]}),first);
  assert.equal(store.history(id).length,1);
  call('edit-description','world_edit',{action:'replace',path:['description'],source:'"Updated"'});
  const before=store.get(id);
  store.db.exec("CREATE TRIGGER fail_journaled_section BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END");
  assert.throws(()=>call('checkpoint-description','world_checkpoint',{label:'Description',paths:[['description']]}),/simulated disk/);
  assert.deepEqual(store.get(id),before);assert.equal(store.history(id).length,1);
  store.db.exec('DROP TRIGGER fail_journaled_section');
  const next=call('checkpoint-description','world_checkpoint',{label:'Description',paths:[['description']]});
  assert.equal(next.checkpoint.sequence,2);assert.equal(store.history(id).length,2);
  assert.equal(store.project(id).activeSource,source);
  assert.throws(()=>call('checkpoint-title','world_checkpoint',{label:'Changed replay',paths:[['title']]}),/reused/);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});

test('section source and receipt persist atomically, ignore supplied baselines, and restore as proposals',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-sections-'));let store=new Store(directory);
 const source='{"title":"Before","description":"Original","aiInstructions":{}}';
 try{
  const id=store.create('World',source).project!.id;
  store.dispatch(id,{type:'workOrder',baseHash:hash(source),order:{reviewedScope:true,objective:'Improve sections',requirements:[],allowedPaths:[],wholeWorld:true}});
  store.dispatch(id,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work'});store.dispatch(id,{type:'taskRunning',taskId:'task',attempt:'attempt'});
  const dispatch=(type:string,extra:any={})=>store.dispatch(id,{type,taskId:'task',attempt:'attempt',...extra});
  dispatch('taskEdit',{path:['title'],source:'"After"',action:'replace'});
  dispatch('taskSectionCheckpoint',{paths:[['title']],label:'Title',sectionCheckpointId:'untrusted-id'});
  const first=store.project(id).tasks[0].sectionCheckpoints![0];assert.notEqual(first.id,'untrusted-id');
  assert.equal(store.history(id).length,1);assert.equal(store.project(id).activeSource,source);
  dispatch('taskSectionCheckpoint',{paths:[['title']],label:'Title'});assert.equal(store.history(id).length,1);
  dispatch('taskEdit',{path:['aiInstructions'],source:'42',action:'replace'});
  assert.throws(()=>dispatch('taskSectionCheckpoint',{paths:[['aiInstructions']],label:'Instructions',sectionBaseSource:store.project(id).tasks[0].stagedSource}),/New validation errors/);
  assert.equal(store.history(id).length,1);assert.equal(store.project(id).tasks[0].sectionCheckpoints!.length,1);
  dispatch('taskEdit',{path:['aiInstructions'],source:'{"story":{"tone":"Gentle"}}',action:'replace'});
  store.db.exec("CREATE TRIGGER fail_section BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END");
  const before=store.get(id);assert.throws(()=>dispatch('taskSectionCheckpoint',{paths:[['aiInstructions']],label:'Instructions'}),/simulated disk/);assert.deepEqual(store.get(id),before);
  store.db.exec('DROP TRIGGER fail_section');dispatch('taskSectionCheckpoint',{paths:[['aiInstructions']],label:'Instructions'});
  assert.equal(store.history(id).length,2);
  store.close();store=new Store(directory);assert.equal(store.project(id).tasks[0].sectionCheckpoints!.length,2);
  const latest=store.project(id).tasks[0].sectionCheckpoints!.at(-1)!;
  const savedSource=(store.db.prepare('SELECT source FROM checkpoints WHERE id=?').get(latest.id) as any).source;
  store.db.prepare('UPDATE checkpoints SET source=? WHERE id=?').run('{}',latest.id);
  assert.throws(()=>dispatch('taskSectionCheckpoint',{paths:[['aiInstructions']],label:'Instructions'}),/frozen section checkpoint source/);
  store.db.prepare('UPDATE checkpoints SET source=? WHERE id=?').run(savedSource,latest.id);
  const restored=store.restore(id,first.id).project!;assert.equal(restored.activeSource,source);assert.match(restored.candidates[0].source,/"title":"After"/);assert.equal(restored.candidates[0].kind,'checkpoint');
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
