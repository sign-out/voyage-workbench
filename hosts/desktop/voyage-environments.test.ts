import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';

const contract=readFileSync('docs/openapi.json','utf8'),guide=readFileSync('docs/voyage-agent-guide.md','utf8');
function fixture(){
 const directory=mkdtempSync(path.join(os.tmpdir(),'voyage-environments-')),keys=new Map([['voyage','production-key'],['voyage-alpha','alpha-key'],['voyage-beta','beta-key']]);
 const secrets={durable:true,get:(key:string)=>keys.get(key)||'',set:(key:string,value:string)=>{keys.set(key,value);}};
 return {directory,keys,secrets,service:new Service(directory,path.resolve('apps/workbench/public/references'),secrets)};
}
test('explicit switches verify docs, isolate keys and let shared worlds use the selected host after restart',async()=>{
 const setup=fixture(),original=globalThis.fetch,calls:any[]=[];let service=setup.service;
 try{
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});if(String(url).endsWith('/openapi.json')){assert.equal((init?.headers as any).Authorization,undefined);assert.equal((init?.headers as any).Origin,undefined);return new Response(contract);}if(String(url).endsWith('/agent-guide.md'))return new Response(guide);return new Response('{"data":{"world":{"shortId":"WORLD","title":"World","initialGameState":{}}}}',{headers:{etag:'revision'}});};
  service.store.setting('voyageEnvironment','production');assert.equal((await service.request('connection')).environment,'alpha');
  const alpha=(await service.request('downloadWorld',{worldId:'WORLD'})).project;
  const connection=await service.request('setVoyageEnvironment',{environment:'production'});assert.equal(connection.environment,'production');assert.equal(connection.contract.version,'1.3.0-preview');
  assert.equal(service.store.project(alpha.id).remote.environment,'alpha');
  await service.request('validateRemote',{id:alpha.id});assert.equal(calls.at(-1).init.headers.Authorization,'Bearer production-key');assert.equal(service.store.project(alpha.id).activeSource,alpha.activeSource);
  await service.request('remoteWorlds');assert.match(calls.at(-1).url,/^https:\/\/api\.aidungeon\.com\//);assert.equal(calls.at(-1).init.headers.Authorization,'Bearer production-key');
  service.store.close();service=new Service(setup.directory,path.resolve('apps/workbench/public/references'),setup.secrets);assert.equal((await service.request('connection')).environment,'production');
  const beta=await service.request('setVoyageEnvironment',{environment:'beta'});assert.equal(beta.environment,'beta');assert.equal(beta.voyage,true);assert.equal(beta.contract.environment,'beta');
  await service.request('remoteWorlds');assert.match(calls.at(-1).url,/^https:\/\/api-beta\.aidungeon\.com\//);assert.equal(calls.at(-1).init.headers.Authorization,'Bearer beta-key');
  service.store.close();service=new Service(setup.directory,path.resolve('apps/workbench/public/references'),setup.secrets);assert.equal((await service.request('connection')).environment,'beta');
  const betaProject=(await service.request('downloadWorld',{worldId:'WORLD'})).project;assert.equal(betaProject.remote.environment,'beta');
  await service.request('setVoyageEnvironment',{environment:'alpha'});await service.request('remoteWorlds');assert.equal(calls.at(-1).init.headers.Authorization,'Bearer alpha-key');
  await service.request('validateRemote',{id:betaProject.id});assert.equal(calls.at(-1).init.headers.Authorization,'Bearer alpha-key');assert.equal(service.store.project(betaProject.id).activeSource,betaProject.activeSource);
  assert.equal(setup.keys.get('voyage'),'production-key');assert.equal(setup.keys.get('voyage-alpha'),'alpha-key');assert.equal(setup.keys.get('voyage-beta'),'beta-key');
 }finally{globalThis.fetch=original;service.store.close();rmSync(setup.directory,{recursive:true,force:true});}
});
test('failed or unexpected documentation retains prior environment and cached evidence',async()=>{
 const {service,directory}=fixture(),original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>new Response(String(url).endsWith('.json')?contract:guide);
  await service.request('setVoyageEnvironment',{environment:'production'});const before=await service.request('connection');
  for(const response of [()=>new Response('Unavailable',{status:503}),()=>new Response('{}')]){
   globalThis.fetch=async()=>response();for(const environment of ['alpha','beta']){await assert.rejects(service.request('setVoyageEnvironment',{environment}));assert.deepEqual(await service.request('connection'),before);}
   await assert.rejects(service.request('refreshVoyageContract'));assert.deepEqual(await service.request('connection'),before);
  }
  await assert.rejects(service.request('setVoyageEnvironment',{environment:'staging'}),/Unsupported/);
  await assert.rejects(service.request('setVoyageEnvironment',{environment:'https://other.test'}),/Unsupported/);
 }finally{globalThis.fetch=original;service.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('production and beta workflows validate and conditionally save on their original host',async()=>{
 for(const environment of ['production','beta']){
 const {service,directory}=fixture(),original=globalThis.fetch,source='{"shortId":"WORLD","title":"World","initialGameState":{"heroesVersion":37,"compatibilityRevision":9,"exact":9007199254740993}}',calls:any[]=[];
 try{
  let saved=source;
  globalThis.fetch=async(url,init)=>{
   const target=String(url);calls.push({url:target,init});assert.equal(new URL(target).origin,environment==='beta'?'https://api-beta.aidungeon.com':'https://api.aidungeon.com');
   if(target.endsWith('/openapi.json'))return new Response(contract);if(target.endsWith('/agent-guide.md'))return new Response(guide);
   assert.equal((init?.headers as any).Authorization,'Bearer '+environment+'-key');
   if(target.endsWith('/validate'))return new Response('{"data":{"valid":true,"errors":[],"warnings":[]}}');
   if(init?.method==='PUT'){assert.equal((init.headers as any)['If-Match'],'"revision"');saved=JSON.parse(String(init.body)).world?String(init.body).slice('{"world":'.length,-1):'';return new Response('{}');}
   return new Response('{"data":{"world":'+saved+'}}',{headers:{etag:'revision'}});
  };
  await service.request('setVoyageEnvironment',{environment});
  const project=(await service.request('create',{name:'Imported through Alpha',source})).project;
  service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'revision',envelopeSource:source,baselineHash:hash(source)});
  await service.request('command',{id:project.id,command:{type:'edit',path:['title'],source:'"Edited"',baseHash:hash(project.activeSource)}});
  await service.request('saveRemote',{id:project.id});
  assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');assert.equal(service.store.project(project.id).remote.operations[0].environment,environment);assert.equal(service.store.project(project.id).remote.environment,environment);assert.match(saved,/9007199254740993/);assert.match(saved,/"compatibilityRevision":9/);
  assert.equal(calls.filter(call=>call.init?.method==='PUT').length,1);
  const binding={projectId:project.id,environment,worldId:'WORLD'};
  await service.request('creatorRequest',{...binding,method:'POST',endpoint:'/uploads',body:'{}',idempotencyKey:'upload-key'});
  await service.request('creatorRequest',{...binding,method:'POST',endpoint:'/worlds/WORLD/uploads/upload/moderate',body:'{}',idempotencyKey:'moderate-key'});
  await service.request('creatorRequest',{method:'POST',endpoint:'/worlds/WORLD/publish',body:'{}',idempotencyKey:'publish-key'});
  assert.equal(calls.at(-1).init.headers['Idempotency-Key'],'publish-key');
  const before=calls.length;await assert.rejects(service.request('creatorRequest',{...binding,environment:'alpha',method:'POST',endpoint:'/uploads',body:'{}'}),/binding changed/);assert.equal(calls.length,before);
 }finally{globalThis.fetch=original;service.store.close();rmSync(directory,{recursive:true,force:true});}
 }
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
test('world engine checks follow the selected host while uncertain saves reconcile on their original host',async()=>{
 const {service,directory}=fixture(),original=globalThis.fetch,source='{"shortId":"WORLD","title":"World","initialGameState":{"heroesVersion":37,"compatibilityRevision":9,"exact":9007199254740993}}',calls:any[]=[];
 try{
  const project=(await service.request('create',{name:'Shared world',source})).project;
  service.store.dispatch(project.id,{type:'remoteLink',environment:'alpha',worldId:'WORLD',envelopeSource:source,etag:'revision',baselineHash:hash(source)});
  service.store.dispatch(project.id,{type:'savePrepare',id:'pending-alpha',environment:'alpha',payload:'{"world":'+source+'}',baseHash:hash(source)});
  service.store.dispatch(project.id,{type:'saveState',id:'pending-alpha',state:'SEND_ATTEMPTED'});
  service.store.setting('voyageEnvironmentSelection','beta');
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response('{"data":{"world":'+source+'}}',{headers:{etag:'revision'}});};
  await service.request('reconcileSave',{id:project.id});assert.equal(calls.length,1);assert.match(calls[0].url,/api-alpha/);assert.equal(calls[0].init.headers.Authorization,'Bearer alpha-key');assert.equal(service.store.project(project.id).remote.operations[0].state,'CONFIRMED');
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});assert.match(String(url),/api-beta/);assert.equal((init?.headers as any).Authorization,'Bearer beta-key');return new Response('{"data":{"world":'+source.replace('"compatibilityRevision":9','"compatibilityRevision":10')+',"savedVersion":{"heroesVersion":37,"compatibilityRevision":9},"pendingVersionUpgrade":{"sourceVersion":{"heroesVersion":37,"compatibilityRevision":9},"targetVersion":{"heroesVersion":37,"compatibilityRevision":10}}}}',{headers:{etag:'newer-revision'}});};
  const before=calls.length;await assert.rejects(service.request('worldEngine',{id:project.id,environment:'alpha'}),/connection changed/);assert.equal(calls.length,before);const engine=await service.request('worldEngine',{id:project.id,environment:'beta'});assert.match(engine.warning,/World engine upgrade/);assert.equal(engine.environment,'beta');assert.equal(service.store.project(project.id).activeSource,source);assert.equal(service.store.project(project.id).remote.etag,'revision');assert.equal(calls.filter(call=>call.init.method==='POST'||call.init.method==='PUT').length,0);
 }finally{globalThis.fetch=original;service.store.close();rmSync(directory,{recursive:true,force:true});}
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
