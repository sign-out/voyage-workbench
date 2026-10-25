import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';

test('Alpha weak ETags save with quoted revisions and recover legacy invalid_revision failures',async()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'voyage-weak-etag-')),original=globalThis.fetch;
  const service=new Service(folder,path.resolve('apps/workbench/public/references'),{durable:false,get:()=> 'test-key',set:()=>{}});
  const source='{"shortId":"WORLD","title":"Test","initialGameState":{"exact":9007199254740993}}';
  let writes=0,reject=false;
  try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(new URL(String(url)).hostname,'api-alpha.aidungeon.com');
      if(String(url).endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[]}}');
      if(options?.method==='PUT'){
        writes++;
        assert.equal((options.headers as Record<string,string>)['If-Match'],'"revision-1"');
        if(reject)return new Response('{"error":{"code":"invalid_revision","message":"If-Match must contain the quoted world revision"}}',{status:400});
        return new Response('{}');
      }
      return new Response('{"data":{"revision":"revision-1","world":'+source+'}}',{headers:{etag:'W/"revision-1"'}});
    };
    const project=(await service.request('downloadWorld',{worldId:'WORLD'})).project;
    service.store.dispatch(project.id,{type:'savePrepare',id:'old-error',baseHash:hash(source),payload:'{"world":'+source+'}'});
    service.store.dispatch(project.id,{type:'saveState',id:'old-error',state:'SEND_ATTEMPTED'});
    service.store.dispatch(project.id,{type:'saveState',id:'old-error',state:'UNKNOWN',detail:'Voyage HTTP 400 (invalid_revision): If-Match must contain the quoted world revision'});
    await service.request('saveRemote',{id:project.id});
    assert.equal(writes,1);
    assert.equal(service.store.project(project.id).activeSource,source);
    assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');
    assert.equal(service.store.project(project.id).remote.operations[1].state,'REJECTED');
    reject=true;
    await assert.rejects(service.request('saveRemote',{id:project.id}),/invalid_revision/);
    assert.equal(service.store.project(project.id).remote.operations[0].state,'REJECTED');
    reject=false;
    await service.request('saveRemote',{id:project.id});
    assert.equal(writes,3);
    assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');
  }finally{globalThis.fetch=original;service.store.close();rmSync(folder,{recursive:true,force:true});}
});
