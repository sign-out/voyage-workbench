import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {communityFixture} from '../../tests/community-reference-fixture';

test('refresh installs V37 intersection references, persists provenance and retains them on failure',async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-references-')),originalFetch=globalThis.fetch;
 const secrets={durable:false,get:()=>'',set:()=>{}};
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),secrets);
 try{
  const files=communityFixture(),requests:string[]=[];
  globalThis.fetch=async(url,options)=>{
   const file=String(url).replace('https://api.unofficial.voyage/','');assert.ok(Object.hasOwn(files,file));requests.push(file);
   assert.equal(options?.redirect,'error');
   assert.equal(options?.headers,undefined);
   assert.equal(options?.body,undefined);assert.equal(options?.method,undefined);assert.equal(options?.credentials,'omit');
   return new Response(files[file]);
  };
  assert.deepEqual(await service.request('refreshReferences'),{ok:true});
  const installed=await service.request('references');
  assert.equal(installed.meta.schemaVersion,37);
  assert.match(installed.meta.hash,/^[a-f0-9]{64}$/);
  assert.equal(installed.official,false);
  assert.equal(installed.sections.find((entry:any)=>entry.schemaVersion===37).snapshotHash,installed.meta.hash);
  assert.deepEqual(installed.sections.filter((entry:any)=>entry.schemaVersion===37).map((entry:any)=>entry.section),['heroesVersion','npcs','triggerDefinitions']);
  assert.deepEqual(requests,Object.keys(files).filter(file=>!file.startsWith('guides/')).concat('guides/world-building.json'));
  const help=installed.sections.find((entry:any)=>entry.communityHelp).communityHelp;assert.equal(help.guides.length,1);assert.equal(help.pages.length,2);
  const fetchGood=globalThis.fetch;
  globalThis.fetch=async(url,options)=>String(url).endsWith('/wiki.json')?new Response('[]'):fetchGood(url,options);
  const failure=await service.request('refreshReferences');
  assert.equal(failure.ok,false);
  assert.equal(failure.retainedPrevious,true);
  assert.deepEqual(await service.request('references'),installed);
  globalThis.fetch=async(url,options)=>String(url).endsWith('/voice-catalog.json')?new Response('Unavailable',{status:503}):fetchGood(url,options);
  assert.equal((await service.request('refreshReferences')).retainedPrevious,true);
  assert.deepEqual(await service.request('references'),installed);
  let cancelled=false;
  globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8*1024*1024+1));},cancel(){cancelled=true;}}));
  assert.equal((await service.request('refreshReferences')).retainedPrevious,true);assert.equal(cancelled,true);
  assert.deepEqual(await service.request('references'),installed);
  const setting=service.store.setting.bind(service.store);
  globalThis.fetch=fetchGood;
  service.store.setting=(key,value)=>{if(key==='referenceMeta'&&value!==undefined)throw new Error('Simulated disk failure');return setting(key,value);};
  assert.equal((await service.request('refreshReferences')).retainedPrevious,true);
  service.store.setting=setting;
  assert.deepEqual(await service.request('references'),installed);
  const restarted=new Service(directory,path.resolve('apps/workbench/public/references'),secrets);
  try{assert.deepEqual(await restarted.request('references'),installed);}finally{restarted.store.close();}
 }finally{globalThis.fetch=originalFetch;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
