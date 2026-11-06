import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';

const contract=readFileSync('docs/openapi.json','utf8'),guide=readFileSync('docs/voyage-agent-guide.md','utf8');
function fixture(){
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-environments-')),keys=new Map([['voyage','production-key'],['voyage-alpha','alpha-key']]);
 const secrets={durable:true,get:(key:string)=>keys.get(key)||'',set:(key:string,value:string)=>{keys.set(key,value);}};
 return {directory,keys,secrets,service:new Service(directory,path.resolve('apps/workbench/public/references'),secrets)};
}
test('explicit switches verify public host docs, isolate keys and survive restart without retargeting projects',async()=>{
 const setup=fixture(),original=globalThis.fetch,calls:any[]=[];let service=setup.service;
 try{
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});if(String(url).endsWith('/openapi.json')){assert.equal((init?.headers as any).Authorization,undefined);assert.equal((init?.headers as any).Origin,undefined);return new Response(contract);}if(String(url).endsWith('/agent-guide.md'))return new Response(guide);return new Response('{"data":{"world":{"shortId":"WORLD","title":"World","initialGameState":{}}}}',{headers:{etag:'revision'}});};
  service.store.setting('voyageEnvironment','production');assert.equal((await service.request('connection')).environment,'alpha');
  const alpha=(await service.request('downloadWorld',{worldId:'WORLD'})).project;
  const connection=await service.request('setVoyageEnvironment',{environment:'production'});assert.equal(connection.environment,'production');assert.equal(connection.contract.version,'1.3.0-preview');
  assert.equal(service.store.project(alpha.id).remote.environment,'alpha');
  const before=calls.length;for(const method of ['validateRemote','saveRemote','reconcileSave'])await assert.rejects(service.request(method,{id:alpha.id}),/linked to alpha/);assert.equal(calls.length,before);
  await service.request('remoteWorlds');assert.match(calls.at(-1).url,/^https:\/\/api\.aidungeon\.com\//);assert.equal(calls.at(-1).init.headers.Authorization,'Bearer production-key');
  service.store.close();service=new Service(setup.directory,path.resolve('apps/workbench/public/references'),setup.secrets);assert.equal((await service.request('connection')).environment,'production');
  await service.request('setVoyageEnvironment',{environment:'alpha'});await service.request('remoteWorlds');assert.equal(calls.at(-1).init.headers.Authorization,'Bearer alpha-key');
  assert.equal(setup.keys.get('voyage'),'production-key');assert.equal(setup.keys.get('voyage-alpha'),'alpha-key');
 }finally{globalThis.fetch=original;service.store.close();rmSync(setup.directory,{recursive:true,force:true});}
});
test('failed or unexpected documentation retains prior environment and cached evidence',async()=>{
 const {service,directory}=fixture(),original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>new Response(String(url).endsWith('.json')?contract:guide);
  await service.request('setVoyageEnvironment',{environment:'production'});const before=await service.request('connection');
  for(const response of [()=>new Response('Unavailable',{status:503}),()=>new Response('{}')]){
   globalThis.fetch=async()=>response();await assert.rejects(service.request('setVoyageEnvironment',{environment:'alpha'}));assert.deepEqual(await service.request('connection'),before);
   await assert.rejects(service.request('refreshVoyageContract'));assert.deepEqual(await service.request('connection'),before);
  }
  await assert.rejects(service.request('setVoyageEnvironment',{environment:'beta'}),/not confirmed/);
  await assert.rejects(service.request('setVoyageEnvironment',{environment:'https://other.test'}),/Unsupported/);
 }finally{globalThis.fetch=original;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('production conditional save validates and confirms read-back on its original host',async()=>{
 const {service,directory}=fixture(),original=globalThis.fetch,source='{"shortId":"WORLD","title":"World","initialGameState":{"heroesVersion":37,"compatibilityRevision":9,"exact":9007199254740993}}',calls:any[]=[];
 try{
  let saved=source;
  globalThis.fetch=async(url,init)=>{
   const target=String(url);calls.push({url:target,init});assert.match(target,/^https:\/\/api\.aidungeon\.com\//);
   if(target.endsWith('/openapi.json'))return new Response(contract);if(target.endsWith('/agent-guide.md'))return new Response(guide);
   assert.equal((init?.headers as any).Authorization,'Bearer production-key');
   if(target.endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[],"warnings":[]}}');
   if(init?.method==='PUT'){assert.equal((init.headers as any)['If-Match'],'"revision"');saved=JSON.parse(String(init.body)).world?String(init.body).slice('{"world":'.length,-1):'';return new Response('{}');}
   return new Response('{"data":{"world":'+saved+'}}',{headers:{etag:'revision'}});
  };
  await service.request('setVoyageEnvironment',{environment:'production'});
  const project=(await service.request('downloadWorld',{worldId:'WORLD'})).project;
  await service.request('command',{id:project.id,command:{type:'edit',path:['title'],source:'"Edited"',baseHash:hash(project.activeSource)}});
  await service.request('saveRemote',{id:project.id});
  assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');assert.match(saved,/9007199254740993/);assert.match(saved,/"compatibilityRevision":9/);
  assert.equal(calls.filter(call=>call.init?.method==='PUT').length,1);
 }finally{globalThis.fetch=original;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('stale publish validation cannot become evidence for a changed local world',async()=>{
 const {service,directory}=fixture(),source='{"shortId":"WORLD","title":"World","initialGameState":{}}';
 try{
  const project=service.store.create('World',source).project!;
  service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'revision',baselineHash:hash(source)});
  let finish!:(response:any)=>void;
  service.voyage=async(method,endpoint,body)=>{assert.equal(endpoint,'/validate');assert.equal(JSON.parse(body!).stage,'publish');return new Promise(resolve=>{finish=resolve;});};
  const validation=service.request('validateRemote',{id:project.id,stage:'publish'});
  service.store.dispatch(project.id,{type:'edit',path:['title'],source:'"Changed"',baseHash:hash(source)});
  finish({text:'{"data":{"valid":true,"errors":[],"warnings":[]}}',etag:''});
  await assert.rejects(validation,/changed during validation/);assert.equal(service.store.project(project.id).remote.validation,undefined);
  await assert.rejects(service.request('validateRemote',{id:project.id,stage:'invented'}),/stage/);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('an older environment switch cannot overwrite a newer completed selection',async()=>{
 const {service,directory}=fixture();
 try{
  let finish!:(snapshot:any)=>void;
  const original=service.readVoyageContract.bind(service);
  service.readVoyageContract=async environment=>environment==='production'?new Promise(resolve=>{finish=resolve;}):{environment:'alpha',version:'fixture',hash:'hash',guideHash:'guide',checked:1,operations:[],media:{WORLD_COVER:{width:1280,height:720}}};
  const pending=service.request('setVoyageEnvironment',{environment:'production'});
  await service.request('setVoyageEnvironment',{environment:'alpha'});
  finish({environment:'production'});await assert.rejects(pending,/environment changed/);assert.equal((await service.request('connection')).environment,'alpha');
  service.readVoyageContract=original;
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
