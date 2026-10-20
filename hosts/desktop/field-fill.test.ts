import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from './service';
import {Store} from './store';
import {defaultSettings} from '../../packages/core/providers';
import {hash} from '../../packages/core/project';
import {applyFieldFill,undoFieldFill} from '../../packages/core/field-fill';

const source='{"title":"Active title","description":""}';
const draftSource='{"title":"Draft context","description":"","npcs":{"one":{"description":""}}}';
const result=[{path:['description'],value:'A harbor where clocks run backward.'},{path:['npcs','one','description'],value:'A retired navigator.'}];
async function waitForTask(service:Service,id:string){for(let attempt=0;attempt<200&&['PREPARED','RUNNING'].includes(service.store.project(id).tasks[0].state);attempt++)await new Promise(resolve=>setTimeout(resolve,10));return service.store.project(id);}

test('fake provider reads frozen draft, rejects malicious tools and saves result without changing world or chat',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-field-fill-'));let calls=0;
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);calls++;
  assert.match(body.messages[0].content,/read-only Voyage prose field filler/);
  assert.deepEqual(body.tools.map((tool:any)=>tool.function.name),['world_read','world_children','world_search','world_validate','world_schema']);
  const packet=JSON.parse(body.messages.find((message:any)=>message.role==='user').content);
  assert.equal(packet.fieldFill.sourceHash,hash(draftSource));assert.equal(packet.fieldFill.instructions,'Maritime mystery.');assert.equal(packet.memory,'');assert.deepEqual(packet.history,[]);assert.equal(packet.artworkDestinations,undefined);
  if(calls===2){assert.match(body.messages.at(-1).content,/unavailable/);assert.equal(JSON.parse(body.messages.find((message:any)=>message.role==='tool').content).source,'"Draft context"');}
  response.setHeader('Content-Type','application/json');
  const message=calls===1?{tool_calls:[{id:'read',type:'function',function:{name:'world_read',arguments:'{"path":["title"]}'}},...['world_edit','propose_work_order','propose_artwork','world_notes','record_note_plan'].map(name=>({id:name,type:'function',function:{name,arguments:'{}'}}))]}:{content:JSON.stringify(result)};
  if(calls===2)assert(body.messages.filter((message:any)=>message.role==='tool').slice(1).every((message:any)=>/unavailable/.test(message.content)));
  response.end(JSON.stringify({choices:[{message}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Fixture',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'selected-model'});settings.routes.planning={profileId:'fixture',model:''};await service.request('saveProviderSettings',{settings});
  const project=(await service.request('create',{name:'Field fill',source})).project;
  await service.request('startAgent',{id:project.id,kind:'plan',fieldFill:{source:draftSource,path:[],instructions:'Maritime mystery.'}});
  const saved=await waitForTask(service,project.id),task=saved.tasks[0];
  assert.equal(task.state,'COMPLETED',task.error);assert.equal(task.route?.model,'selected-model');assert.equal(task.baseHash,hash(draftSource));assert.deepEqual(task.fieldFill?.result,result);assert.equal(saved.activeSource,source);assert.deepEqual(saved.chat,[]);assert.deepEqual(saved.candidates,[]);assert.equal(saved.workOrderProposals,undefined);assert.equal(saved.artworkProposals,undefined);
  const snapshot=task.fieldFill!,applied=applyFieldFill(draftSource.replace('Draft context','Edited context'),snapshot,result);assert.equal(applied.changes.length,2);
  const edited=applied.source.replace(result[0].value,'Later author edit'),undone=undoFieldFill(edited,applied.changes);assert.equal(undone.changes.length,1);assert.match(undone.source,/Later author edit/);
  const reopened=new Store(directory);try{assert.deepEqual(reopened.project(project.id).tasks[0].fieldFill?.result,result);}finally{reopened.close();}
 }finally{service.store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});

test('invalid provider result fails safely and direct hidden-tool dispatch is denied',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-field-fill-invalid-'));
 const server=createServer((_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message:{content:JSON.stringify([{path:['title'],value:'Overwrite authored choice'}])}}]}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Fixture',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.planning={profileId:'fixture',model:''};await service.request('saveProviderSettings',{settings});
  const project=(await service.request('create',{name:'Field fill',source})).project;
  service.store.dispatch(project.id,{type:'prepareTask',id:'manual',attempt:'one',kind:'plan',fieldFill:{source,path:[],instructions:''}});service.store.dispatch(project.id,{type:'taskRunning',taskId:'manual'});
  for(const name of ['world_edit','world_notes','propose_work_order','propose_artwork','record_note_plan'])assert.throws(()=>service.providers.tool(project.id,'manual',name,{}),/unavailable/);
  service.store.dispatch(project.id,{type:'taskStop',taskId:'manual',state:'CANCELED'});
  await service.request('startAgent',{id:project.id,kind:'plan',fieldFill:{source,path:[],instructions:''}});
  const saved=await waitForTask(service,project.id);assert.equal(saved.tasks[0].state,'FAILED');assert.equal(saved.tasks[0].fieldFill?.result,undefined);assert.equal(saved.activeSource,source);assert.deepEqual(saved.chat,[]);
 }finally{service.store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});

test('canceling a provider call prevents late result persistence',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-field-fill-cancel-'));let release:()=>void=()=>{},arrived:()=>void=()=>{};
 const seen=new Promise<void>(resolve=>{arrived=resolve;});
 const server=createServer(async(_request,response)=>{arrived();await new Promise<void>(resolve=>{release=resolve;});response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message:{content:JSON.stringify([result[0]])}}]}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Fixture',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.planning={profileId:'fixture',model:''};await service.request('saveProviderSettings',{settings});
  const project=(await service.request('create',{name:'Field fill',source})).project;await service.request('startAgent',{id:project.id,kind:'plan',fieldFill:{source,path:[],instructions:''}});await seen;
  const task=service.store.project(project.id).tasks[0];service.providers.cancel(project.id,task.id);release();
  for(let attempt=0;attempt<100&&service.providers.running.has(task.id);attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  const saved=service.store.project(project.id);assert.equal(saved.tasks[0].state,'CANCELED');assert.equal(saved.tasks[0].fieldFill?.result,undefined);assert.equal(saved.activeSource,source);assert.deepEqual(saved.chat,[]);
 }finally{release();service.store.close();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});
