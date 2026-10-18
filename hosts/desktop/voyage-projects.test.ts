import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';

test('owned world and mod listings use typed pagination and open as independent linked projects',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-project-picker-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 const endpoints:string[]=[];
 service.voyage=async(method,endpoint)=>{assert.equal(method,'GET');endpoints.push(endpoint);return endpoint.startsWith('/worlds?')?{text:'{"data":{"worlds":[]}}',etag:''}:{text:'{"data":{"world":{"title":"Owned mod","isMod":true,"initialGameState":{"counter":9007199254740993}}}}',etag:'mod-v1'};};
 try{
  const local=(await service.request('create',{name:'Keep local',source:'{"title":"Local"}'})).project;
  await service.request('remoteWorlds',{type:'world',page:0});
  await service.request('remoteWorlds',{type:'mod',page:2});
  await service.request('remoteWorlds',{page:1});
  assert.deepEqual(endpoints,['/worlds?page=0&type=world','/worlds?page=2&type=mod','/worlds?page=1']);
  await assert.rejects(service.request('remoteWorlds',{type:'invalid'}),/worlds or mods/);
  assert.equal(endpoints.length,3);
  const imported=(await service.request('downloadWorld',{worldId:'owned-mod',name:'Owned mod'})).project;
  assert.notEqual(imported.id,local.id);
  assert.equal(imported.name,'Owned mod');
  assert.match(imported.activeSource,/"isMod":true/);
  assert.match(imported.activeSource,/9007199254740993/);
  assert.equal(imported.remote.worldId,'owned-mod');
  assert.equal(imported.remote.etag,'mod-v1');
  assert.equal(service.store.project(local.id).activeSource,local.activeSource);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
