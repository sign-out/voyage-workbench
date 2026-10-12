import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {Service} from './service';import {hash} from '../../packages/core/project';import * as doc from '../../packages/core/document';

test('download, selectively review raw import, save, and recover an old raw-state replacement',async()=>{
 const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-shape-')),original=globalThis.fetch,source='{"shortId":"WORLD","title":"API metadata","initialGameState":{"keep":9007199254740993,"change":"old"}}';
 let service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}}),saved=source,writes=0;
 try{
  globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://api-alpha.aidungeon.com/'));if(String(url).endsWith('/validate'))return new Response('{"data":{"valid":true}}');if(options?.method==='PUT'){writes++;saved=doc.read(String(options.body),['world']);assert.equal(doc.read(saved,['shortId']),'"WORLD"');assert.equal(doc.read(saved,['title']),'"API metadata"');return new Response('{}');}return new Response('{"data":{"world":'+saved+'}}',{headers:{etag:writes?'v2':'v1'}});};
  const downloaded=(await service.request('downloadWorld',{worldId:'WORLD'})).project;assert.equal(downloaded.remote.envelopeSource,source);
  let project=(await service.request('command',{id:downloaded.id,command:{type:'stage',id:'import',kind:'import',source:'{"keep":9007199254740995,"change":"new"}'}})).project;
  project=(await service.request('command',{id:project.id,command:{type:'candidateChange',id:'import',path:['initialGameState','keep'],kind:'changed',reject:true,candidateHash:hash(project.candidates[0].source)}})).project;
  service.store.close();service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});assert.equal(service.store.project(project.id).candidates[0].rejectedChanges?.length,1);
  await service.request('command',{id:project.id,command:{type:'accept',id:'import'}});await service.request('saveRemote',{id:project.id});assert.equal(writes,1);assert.equal(doc.read(saved,['initialGameState','keep']),'9007199254740993');assert.equal(doc.read(saved,['initialGameState','change']),'"new"');assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');
  const legacy=(await service.request('downloadWorld',{worldId:'WORLD'})).project;await assert.rejects(service.request('command',{id:legacy.id,command:{type:'edit',path:[],source:'{"keep":9007199254740997,"change":"legacy"}',baseHash:hash(legacy.activeSource)}}),/metadata shortId is read only/);assert.equal(service.store.project(legacy.id).activeSource,legacy.activeSource);legacy.activeSource='{"keep":9007199254740997,"change":"legacy"}';service.store.db.prepare('UPDATE projects SET body=? WHERE id=?').run(JSON.stringify(legacy),legacy.id);await service.request('saveRemote',{id:legacy.id});assert.equal(writes,2);assert.equal(doc.read(saved,['initialGameState','keep']),'9007199254740997');assert.equal(service.store.project(legacy.id).remote.operations[0].state,'CONFIRMED');
 }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
