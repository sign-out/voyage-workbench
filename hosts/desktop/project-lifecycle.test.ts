import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';

test('local projects can be trashed, restored and deleted without affecting other worlds',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-project-lifecycle-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const project=(await service.request('create',{name:'Remove me',source:'{"title":"Local"}'})).project;
  const other=(await service.request('create',{name:'Keep me',source:'{"title":"Other"}'})).project;
  await service.request('checkpoint',{id:project.id});
  await assert.rejects(service.request('deleteProject',{id:project.id}),/trash first/);
  await service.request('command',{id:project.id,command:{type:'projectStatus',status:'trashed'}});
  assert.equal(service.store.project(project.id).status,'trashed');
  await service.request('command',{id:project.id,command:{type:'projectStatus',status:'active'}});
  assert.equal(service.store.project(project.id).activeSource,project.activeSource);
  await service.request('command',{id:project.id,command:{type:'projectStatus',status:'trashed'}});
  await service.request('deleteProject',{id:project.id});
  assert.deepEqual((await service.request('projects')).map((row:any)=>row.id),[other.id]);
  assert.equal((await service.request('history',{id:project.id})).length,0);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
