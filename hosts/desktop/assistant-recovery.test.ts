import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import type {Rpc} from './codex';
import {hash} from '../../packages/core/project';
import type {Message} from '../../packages/core/providers';

function fixture(){
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-recovery-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 return {service,close:()=>{service.store.close();rmSync(directory,{recursive:true,force:true});}};
}
function prepare(service:Service,settings={enabled:true,maxAttempts:2},extra:any={}){
 const project=service.store.create('Recovery','{"title":"Original","description":""}').project!;
 service.store.dispatch(project.id,{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',assistantRecovery:settings,route:{id:'synthetic',name:'Synthetic',protocol:'claude-code',baseUrl:'',model:''},...extra});
 return project.id;
}
const invalidCall={id:'bad',name:'world_read',args:{path:['missing']}};
const validCall={id:'good',name:'world_read',args:{path:['title']}};
function fakeRpc(){
 return {onEvent:(_method:string,_params:any)=>{},onTool:async(_name:string,_args:any):Promise<any>=>null,closed:0,requests:[] as string[],init:async()=>{},close(){this.closed++;},async request(method:string){this.requests.push(method);return method==='account/read'?{account:{type:'chatgpt'}}:method==='thread/start'?{thread:{id:'thread'}}:{};}};
}

test('desktop settings default, strictly reject writes, persist and tolerate corrupted storage',async()=>{
 const {service,close}=fixture();
 try{
  assert.deepEqual(await service.request('assistantRecoverySettings'),{enabled:true,maxAttempts:3});
  for(const settings of [null,{},[],{enabled:1,maxAttempts:2},{enabled:true,maxAttempts:'2'},{enabled:true,maxAttempts:0},{enabled:true,maxAttempts:11},{enabled:true,maxAttempts:1.5}])await assert.rejects(service.request('saveAssistantRecoverySettings',{settings}));
  await service.request('saveAssistantRecoverySettings',{settings:{enabled:false,maxAttempts:10}});
  assert.deepEqual(JSON.parse(service.store.setting('assistantRecovery')),{enabled:false,maxAttempts:10});
  await service.request('saveAssistantRecoverySettings',{enabled:true,maxAttempts:1});
  assert.deepEqual(await service.request('assistantRecoverySettings'),{enabled:true,maxAttempts:1});
  service.agent.run=async()=>{};
  const project=service.store.create('Snapshot','{}').project!;
  await service.request('startAgent',{id:project.id,kind:'plan'});
  await service.request('saveAssistantRecoverySettings',{enabled:false,maxAttempts:5});
  assert.deepEqual(service.store.project(project.id).tasks[0].assistantRecovery,{enabled:true,maxAttempts:1});
  assert.equal(service.store.project(project.id).tasks.length,1);
  for(const stored of ['{broken','null','{"enabled":"false","maxAttempts":3}']){
   service.store.setting('assistantRecovery',stored);
   assert.deepEqual(await service.request('assistantRecoverySettings'),{enabled:true,maxAttempts:3});
   const fresh=service.store.create('Corrupt fallback','{}').project!;
   await service.request('startAgent',{id:fresh.id,kind:'plan'});
   assert.deepEqual(service.store.project(fresh.id).tasks[0].assistantRecovery,{enabled:true,maxAttempts:3});
  }
 }finally{close();}
});

test('provider enforces task-total budget across successful calls and stops remaining batch calls',async()=>{
 const {service,close}=fixture();
 try{
  const id=prepare(service);let turns=0;
  const received:Message[][]=[];
  service.providers.harness=async(_route,messages)=>{received.push(structuredClone(messages));turns++;return {role:'assistant',calls:turns<=2?[invalidCall,validCall]:[invalidCall,validCall]};};
  await service.providers.run(id,'task');
  const project=service.store.project(id);
  assert.equal(turns,3);
  assert.equal(project.tasks[0].state,'FAILED');
  assert.match(project.tasks[0].error!,/exhausted after 2 corrective opportunities/);
  assert.equal(received[2].filter(message=>message.role==='tool').length,4);
  assert.equal(project.activeSource,'{"title":"Original","description":""}');
  assert.equal(project.tasks.length,1);
 }finally{close();}
});

test('provider disabled fails first error; enabled can complete a correction',async()=>{
 for(const enabled of [false,true]){
  const {service,close}=fixture();
  try{
   const id=prepare(service,{enabled,maxAttempts:1});let turns=0;
   service.providers.harness=async()=>++turns===1?{role:'assistant',calls:[invalidCall]}:{role:'assistant',text:'Corrected',calls:[validCall]};
   if(enabled)service.providers.harness=async()=>++turns===1?{role:'assistant',calls:[invalidCall]}:turns===2?{role:'assistant',calls:[validCall]}:{role:'assistant',text:'Corrected'};
   await service.providers.run(id,'task');
   assert.equal(service.store.project(id).tasks[0].state,enabled?'COMPLETED':'FAILED');
   assert.equal(turns,enabled?3:1);
  }finally{close();}
 }
});

test('provider transport failures never retry, and cancellation after a response prevents tools',async()=>{
 for(const cancel of [false,true]){
  const {service,close}=fixture();
  try{
   const id=prepare(service);let turns=0;
   service.providers.harness=async()=>{turns++;if(!cancel)throw new Error('Network transport failed');service.providers.cancel(id,'task');return {role:'assistant',calls:[validCall]};};
   await service.providers.run(id,'task');
   assert.equal(turns,1);
   assert.equal(service.store.project(id).tasks[0].state,cancel?'CANCELED':'FAILED');
   assert.equal(service.store.project(id).tasks.length,1);
  }finally{close();}
 }
});

test('provider parse-only completion shares tool budget without applying field fill',async()=>{
 const {service,close}=fixture();
 try{
  const id=prepare(service,{enabled:true,maxAttempts:2},{fieldFill:{source:'{"description":""}',path:[],instructions:'Fill description'}});let turns=0;
  service.providers.harness=async()=>{turns++;return turns===1?{role:'assistant',calls:[invalidCall]}:{role:'assistant',text:turns===2?'not JSON':'[]'};};
  await service.providers.run(id,'task');
  assert.equal(turns,3);
  assert.equal(service.store.project(id).tasks[0].state,'COMPLETED');
  assert.deepEqual(service.store.project(id).tasks[0].fieldFill?.result,[]);
  assert.equal(service.store.project(id).activeSource,'{"title":"Original","description":""}');
 }finally{close();}
});

test('delayed tools-only provider response cannot act on a superseding task attempt',async()=>{
 const {service,close}=fixture();
 try{
  const id=prepare(service);let release!:(message:Message)=>void;
  service.providers.harness=async()=>new Promise<Message>(resolve=>{release=resolve;});
  const running=service.providers.run(id,'task');
  service.providers.cancel(id,'task');
  service.store.dispatch(id,{type:'prepareTask',id:'task',attempt:'replacement',kind:'plan'});
  service.store.dispatch(id,{type:'taskRunning',taskId:'task',attempt:'replacement'});
  let executions=0;const tool=service.providers.tool.bind(service.providers);service.providers.tool=(...args)=>{executions++;return tool(...args);};
  release({role:'assistant',calls:[{id:'proposal',name:'propose_work_order',args:{objective:'Must not run',requirements:[],allowedPaths:[['title']]}}]});
  await running;
  assert.equal(executions,0);assert.equal(service.store.project(id).tasks[0].attempt,'replacement');assert.equal(service.store.project(id).tasks[0].state,'RUNNING');assert.equal(service.store.project(id).workOrderProposals,undefined);
 }finally{close();}
});

test('Codex replies enforce budget, close at exhaustion, and reject tools after stopping',async()=>{
 for(const enabled of [false,true]){
  const {service,close}=fixture();const rpc=fakeRpc();
  try{
   const id=prepare(service,{enabled,maxAttempts:2});service.agent.createRpc=()=>rpc as unknown as Rpc;
   await service.agent.run(id,'task');
   if(enabled)for(let attempt=1;attempt<=2;attempt++){
    const result=await rpc.onTool('world_read',{path:['missing']});assert.equal(result.recovery.attempt,attempt);
    assert.deepEqual(await rpc.onTool('world_read',{path:['title']}),{source:'"Original"'});
   }
   await assert.rejects(rpc.onTool('world_read',{path:['missing']}),enabled?/exhausted/:/disabled/);
   assert.equal(service.store.project(id).tasks[0].state,'FAILED');assert.equal(rpc.closed,1);
   await assert.rejects(rpc.onTool('world_read',{path:['title']}),/stopped/);
   assert.equal(rpc.requests.filter(method=>method==='turn/start').length,1);
  }finally{close();}
 }
});

test('Codex completion parse correction uses the same budget as tools',async()=>{
 const {service,close}=fixture();const rpc=fakeRpc();
 try{
  const id=prepare(service,{enabled:true,maxAttempts:1},{fieldFill:{source:'{"description":""}',path:[],instructions:'Fill'}});
  service.agent.createRpc=()=>rpc as unknown as Rpc;await service.agent.run(id,'task');
  await rpc.onTool('world_read',{path:['missing']});
  rpc.onEvent('item/agentMessage/delta',{delta:'not JSON'});rpc.onEvent('turn/completed',{turn:{status:'completed'}});
  assert.match(service.store.project(id).tasks[0].error!,/exhausted/);
  assert.equal(rpc.requests.filter(method=>method==='turn/start').length,1);
 }finally{close();}
});

test('Codex parse-only completion can correct, while cancellation and stale attempts are fatal',async()=>{
 for(const outcome of ['correct','cancel','stale']){
  const {service,close}=fixture();const rpc=fakeRpc();
  try{
   const id=prepare(service,{enabled:true,maxAttempts:1},{fieldFill:{source:'{"description":""}',path:[],instructions:'Fill'}});
   service.agent.createRpc=()=>rpc as unknown as Rpc;await service.agent.run(id,'task');
   if(outcome==='correct'){
    rpc.onEvent('item/agentMessage/delta',{delta:'bad'});rpc.onEvent('turn/completed',{turn:{status:'completed'}});
    assert.equal(service.store.project(id).tasks[0].state,'RUNNING');
    rpc.onEvent('item/agentMessage/delta',{delta:'[]'});rpc.onEvent('turn/completed',{turn:{status:'completed'}});
    assert.equal(service.store.project(id).tasks[0].state,'COMPLETED');
    assert.equal(rpc.requests.filter(method=>method==='turn/start').length,2);
   }else{
    service.agent.cancel(id,'task');
    if(outcome==='stale')service.store.dispatch(id,{type:'prepareTask',id:'task',attempt:'replacement',kind:'plan'});
    await assert.rejects(rpc.onTool('world_read',{path:['title']}),/stopped/);
    assert.equal(service.store.project(id).tasks[0].state,outcome==='stale'?'PREPARED':'CANCELED');
   }
  }finally{close();}
 }
});

test('out-of-scope edits fail immediately without changing approved scope or world',async()=>{
 for(const codex of [false,true]){
  const {service,close}=fixture();const rpc=fakeRpc();
  try{
   const project=service.store.create('Scope','{"title":"Original","description":""}').project!;
   service.store.dispatch(project.id,{type:'workOrder',baseHash:hash(project.activeSource),order:{reviewedScope:true,objective:'Title only',requirements:[],allowedPaths:[['title']]}});
   service.store.dispatch(project.id,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work',route:{id:'synthetic',protocol:'claude-code',model:'',name:'Mock',baseUrl:''}});
   const args={action:'replace',path:['description'],source:'"Outside"'};
   if(codex){service.agent.createRpc=()=>rpc as unknown as Rpc;await service.agent.run(project.id,'task');await assert.rejects(rpc.onTool('world_edit',args),/outside/);}
   else{let turns=0;service.providers.harness=async()=>{assert.equal(++turns,1);return {role:'assistant',calls:[{id:'edit',name:'world_edit',args}]};};await service.providers.run(project.id,'task');}
   const current=service.store.project(project.id);assert.equal(current.tasks[0].state,'FAILED');assert.match(current.tasks[0].error!,/outside/);assert.equal(current.activeSource,project.activeSource);assert.deepEqual(current.workOrder.allowedPaths,[['title']]);
  }finally{close();}
 }
});

test('invalid world diagnostics are readable repeatedly without spending recovery budget',async()=>{
 for(const codex of [false,true]){
  const {service,close}=fixture();const rpc=fakeRpc();
  try{
   service.references=[{section:'title',schema:'string'}];
   const project=service.store.create('Invalid','{"title":123}').project!;
   service.store.dispatch(project.id,{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',assistantRecovery:{enabled:false,maxAttempts:1}});
   if(codex){service.agent.createRpc=()=>rpc as unknown as Rpc;await service.agent.run(project.id,'task');}
   else service.store.dispatch(project.id,{type:'taskRunning',taskId:'task',attempt:'attempt'});
   for(let index=0;index<5;index++){
    const issues=codex?await rpc.onTool('world_validate',{}):service.providers.tool(project.id,'task','world_validate',{});
    assert(Array.isArray(issues));assert(issues.some(issue=>issue.level==='error'));
   }
   assert.equal(service.store.project(project.id).tasks[0].state,'RUNNING');
   if(!codex)assert.equal(service.providers.recoveries.get('task')!.attempts,0);
   if(codex)service.agent.cancel(project.id,'task');
  }finally{close();}
 }
});
