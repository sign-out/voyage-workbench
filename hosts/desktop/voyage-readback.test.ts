import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash,remotePayload} from '../../packages/core/project';

test('saved and previously uncertain worlds reconcile reordered server JSON; real changes stay unconfirmed',async()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-readback-')),original=globalThis.fetch;
  const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});
  const source='{"initialGameState":{"second":2,"first":[{"name":"test","count":1.0}],"exact":9007199254740993}}';
  const reordered='{"initialGameState":{"exact":9007199254740993,"first":[{"count":1,"name":"test"}],"second":2e0}}';
  let writes=0,changed=false;
  try{
    globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[]}}');
      if(options?.method==='PUT'){writes++;assert.equal(options.body,remotePayload(source));return new Response('{}');}
      return new Response('{"data":{"world":'+(changed?reordered.replace('9007199254740993','9007199254740992'):reordered)+'}}',{headers:{etag:'W/"revision"'}});
    };
    const {project}=await service.request('create',{source});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'W/"revision"'});
    await service.request('saveRemote',{id:project.id});
    assert.equal(writes,1);assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');assert.equal(service.store.project(project.id).activeSource,source);
    service.store.dispatch(project.id,{type:'savePrepare',id:'legacy',baseHash:hash(source),payload:remotePayload(source)});
    service.store.dispatch(project.id,{type:'saveState',id:'legacy',state:'SEND_ATTEMPTED'});service.store.dispatch(project.id,{type:'saveState',id:'legacy',state:'UNKNOWN',detail:'Remote content differs; do not retry automatically'});
    await service.request('reconcileSave',{id:project.id});assert.equal(writes,1);assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');
    service.store.dispatch(project.id,{type:'savePrepare',id:'auto-reconcile',baseHash:hash(source),payload:remotePayload(source)});
    service.store.dispatch(project.id,{type:'saveState',id:'auto-reconcile',state:'SEND_ATTEMPTED'});service.store.dispatch(project.id,{type:'saveState',id:'auto-reconcile',state:'UNKNOWN',detail:'Remote content differs; do not retry automatically'});
    await service.request('saveRemote',{id:project.id});assert.equal(writes,1);assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');
    changed=true;await service.request('saveRemote',{id:project.id});const operation=service.store.project(project.id).remote.operations[0];assert.equal(operation.state,'UNKNOWN');assert.equal(operation.comparison.total,1);assert.deepEqual(operation.comparison.paths,[['world','initialGameState','exact']]);
    const blocked=await service.request('saveRemote',{id:project.id});assert.equal(blocked.project.remote.operations[0].state,'UNKNOWN');assert.equal(writes,2);assert.equal(service.store.project(project.id).activeSource,source);
  }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
test('automatic reconciliation confirms an older save before conditionally uploading newer local edits',async()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-auto-newer-')),original=globalThis.fetch;
  const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});
  const source='{"title":"Old","initialGameState":{}}',updated='{"title":"New","initialGameState":{}}';let remote=source,writes=0,reads=0;
  try{
    const {project}=await service.request('create',{source});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'W/"revision-1"'});
    service.store.dispatch(project.id,{type:'savePrepare',id:'older-pending',baseHash:hash(source),payload:remotePayload(source)});service.store.dispatch(project.id,{type:'saveState',id:'older-pending',state:'SEND_ATTEMPTED'});service.store.dispatch(project.id,{type:'saveState',id:'older-pending',state:'UNKNOWN',detail:'Connection lost after send'});
    service.store.dispatch(project.id,{type:'edit',path:['title'],source:'"New"',baseHash:hash(source)});
    globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[]}}');
      if(options?.method==='PUT'){writes++;assert.equal((options.headers as Record<string,string>)['If-Match'],'"revision-2"');assert.equal(options.body,remotePayload(updated));remote=updated;return new Response('{}');}
      reads++;return new Response('{"data":{"world":'+remote+'}}',{headers:{etag:writes?'W/"revision-3"':'W/"revision-2"'}});
    };
    await service.request('saveRemote',{id:project.id});const result=service.store.project(project.id);
    assert.equal(writes,1);assert.equal(reads,2);assert.equal(result.activeSource,updated);assert.equal(result.remote.etag,'W/"revision-3"');assert.deepEqual(result.remote.operations.map(operation=>operation.state),['CONFIRMED','CONFIRMED']);
  }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
test('clean write rejection is recoverable but failed readback after an acknowledged write remains uncertain',async()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-save-outcomes-')),original=globalThis.fetch;
  const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});
  const source='{"title":"Local","initialGameState":{}}';let writes=0,cleanFailure=true;
  try{
    const {project}=await service.request('create',{source});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"revision"'});
    globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[]}}');
      if(options?.method==='PUT'){writes++;return cleanFailure?new Response('{"error":{"code":"studio_unavailable","message":"Studio down"}}',{status:503}):new Response('{}');}
      return new Response('{"error":{"code":"unauthorized","message":"Key expired during readback"}}',{status:401});
    };
    await assert.rejects(service.request('saveRemote',{id:project.id}),/studio_unavailable/);
    assert.equal(writes,1);assert.equal(service.store.project(project.id).remote.operations[0].state,'REJECTED');
    cleanFailure=false;
    await assert.rejects(service.request('saveRemote',{id:project.id}),/Key expired/);
    assert.equal(writes,2);assert.equal(service.store.project(project.id).remote.operations[0].state,'UNKNOWN');
    assert.match(service.store.project(project.id).remote.operations[0].detail!,/acknowledged the write/);
    await assert.rejects(service.request('saveRemote',{id:project.id}),/no new write was sent/);
    assert.equal(writes,2);assert.equal(service.store.project(project.id).activeSource,source);
  }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
test('remote save never writes on a generic success flag, missing errors list or contradictory validation',async()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-validation-outcomes-')),original=globalThis.fetch;
  const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});
  try{
    const {project}=await service.request('create',{source:'{"title":"Local","initialGameState":{}}'});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"revision"'});
    for(const report of [null,[],{success:true},{data:{valid:true}},{data:{valid:true,errors:[{message:'Invalid state'}]}},{data:{valid:false,errors:[]},success:true}]){
      globalThis.fetch=async url=>{assert.ok(String(url).endsWith('/validate'),'No write or readback may follow a failed validation');return new Response(JSON.stringify(report));};
      await assert.rejects(service.request('saveRemote',{id:project.id}),/Official validation/);
      assert.equal(service.store.project(project.id).remote.operations.length,0);
    }
  }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
test('Alpha 1.3 canonical party records and trigger definitions survive conditional save and readback',async()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-canonical-parties-')),original=globalThis.fetch;
  const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});
  const source='{"title":"Canonical world","initialGameState":{"worldBackground":"Shared","triggerDefinitions":{"arrival":{"unknown":9007199254740993}},"parties":{"first":{"quests":{"quest-a":{"unknown":1.2300e+42}},"arcs":{},"narrativeEvents":[]},"second":{"quests":{"quest-b":{"description":"Preserve the other party"}},"partyState":{"unknown":9007199254740995}}}}}';
  let saved='';
  try{
    const {project}=await service.request('create',{source});service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"revision"'});
    globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith('/validate')){assert.match(String(options?.body),/"parties"/);return new Response('{"data":{"valid":true,"errors":[]}}');}
      if(options?.method==='PUT'){saved=String(options.body);assert.equal((options.headers as any)['If-Match'],'"revision"');return new Response('{}');}
      return new Response('{"data":'+saved+'}',{headers:{etag:'"next-revision"'}});
    };
    await service.request('saveRemote',{id:project.id});
    assert.equal(saved,remotePayload(source));assert.match(saved,/9007199254740993/);assert.match(saved,/9007199254740995/);assert.match(saved,/1\.2300e\+42/);
    assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');assert.equal(service.store.project(project.id).activeSource,source);
  }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
