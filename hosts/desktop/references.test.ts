import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';

test('refresh installs V37 intersection references, persists provenance and retains them on failure',async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-references-')),originalFetch=globalThis.fetch;
 const secrets={durable:false,get:()=>'',set:()=>{}};
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),secrets);
 try{
  const schema={_type:'intersection',parts:[{_type:'required',fields:{heroesVersion:{_type:'literal',value:37},npcs:{_type:'record',codomain:'unknown'}}},{_type:'partial',fields:{triggerDefinitions:{_type:'record',codomain:'unknown'}}}]};
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.unofficial.voyage/schema.json');
   assert.equal(options?.redirect,'error');
   assert.equal(options?.headers,undefined);
   return new Response(JSON.stringify(schema));
  };
  assert.deepEqual(await service.request('refreshReferences'),{ok:true});
  const installed=await service.request('references');
  assert.equal(installed.meta.schemaVersion,37);
  assert.match(installed.meta.hash,/^[a-f0-9]{64}$/);
  assert.equal(installed.official,false);
  assert.equal(installed.sections.find((entry:any)=>entry.schemaVersion===37).snapshotHash,installed.meta.hash);
  assert.deepEqual(installed.sections.filter((entry:any)=>entry.schemaVersion===37).map((entry:any)=>entry.section),['heroesVersion','npcs','triggerDefinitions']);
  globalThis.fetch=async()=>new Response('{"_type":"intersection","parts":[]}');
  const failure=await service.request('refreshReferences');
  assert.equal(failure.ok,false);
  assert.equal(failure.retainedPrevious,true);
  assert.deepEqual(await service.request('references'),installed);
  const setting=service.store.setting.bind(service.store);
  globalThis.fetch=async()=>new Response(JSON.stringify({_type:'required',fields:{heroesVersion:{_type:'literal',value:38}}}));
  service.store.setting=(key,value)=>{if(key==='referenceMeta'&&value!==undefined)throw new Error('Simulated disk failure');return setting(key,value);};
  assert.equal((await service.request('refreshReferences')).retainedPrevious,true);
  service.store.setting=setting;
  assert.deepEqual(await service.request('references'),installed);
  const restarted=new Service(directory,path.resolve('apps/workbench/public/references'),secrets);
  try{assert.deepEqual(await restarted.request('references'),installed);}finally{restarted.store.close();}
 }finally{globalThis.fetch=originalFetch;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
