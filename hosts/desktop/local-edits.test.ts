import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';

test('local mode persists and automatic application atomically retains a restorable exact-source checkpoint',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-local-mode-')),resources=path.resolve('apps/workbench/public/references');
 const secrets={durable:false,get:()=>'',set:()=>{}};
 let service=new Service(directory,resources,secrets);
 try{
  assert.deepEqual(await service.request('localEditingSettings'),{mode:'automatic'});
  await assert.rejects(()=>service.request('saveLocalEditingSettings',{mode:'anything'}));
  await service.request('saveLocalEditingSettings',{mode:'proposal-only'});service.store.close();service=new Service(directory,resources,secrets);
  assert.deepEqual(await service.request('localEditingSettings'),{mode:'proposal-only'});
  await service.request('saveLocalEditingSettings',{mode:'automatic'});
  const source='{"title":"Before","exact":9007199254740993,"fraction":1.000}',project=(await service.request('create',{name:'Local fixture',source})).project;
  service.store.dispatch(project.id,{type:'workOrder',order:{objective:'Change title',requirements:[],allowedPaths:[['title']]}});
  service.store.dispatch(project.id,{type:'prepareTask',id:'work',attempt:'attempt',kind:'work',localEditMode:(await service.request('localEditingSettings')).mode});
  await service.request('saveLocalEditingSettings',{mode:'proposal-only'});
  service.store.dispatch(project.id,{type:'taskRunning',taskId:'work',attempt:'attempt'});
  service.store.dispatch(project.id,{type:'taskEdit',taskId:'work',attempt:'attempt',action:'replace',path:['title'],source:'"After"'});
  service.store.db.exec("CREATE TRIGGER reject_checkpoint BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(FAIL, 'Checkpoint unavailable'); END");
  assert.throws(()=>service.store.dispatch(project.id,{type:'taskDone',taskId:'work',attempt:'attempt'}),/Checkpoint unavailable/);
  assert.equal(service.store.project(project.id).activeSource,source);assert.equal(service.store.project(project.id).tasks[0].state,'RUNNING');assert.equal(service.store.history(project.id).length,0);
  service.store.db.exec('DROP TRIGGER reject_checkpoint');
  const applied=(service.store.dispatch(project.id,{type:'taskDone',taskId:'work',attempt:'attempt'}) as any).project;
  assert.equal(applied.tasks[0].state,'APPLIED');assert.equal(applied.activeSource,source.replace('Before','After'));
  const checkpoints=service.store.history(project.id) as any[];assert.equal(checkpoints.length,1);
  const restored=(await service.request('restore',{id:project.id,checkpointId:checkpoints[0].id})).project;
  assert.equal(restored.activeSource,applied.activeSource);assert.equal(restored.candidates[0].source,source);
  const reverted=(await service.request('command',{id:project.id,command:{type:'accept',id:restored.candidates[0].id}})).project;
  assert.equal(reverted.activeSource,source);assert.equal(service.store.history(project.id).length,2);assert.equal(reverted.remote.operations.length,0);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
