import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {defaultSettings} from '../../packages/core/providers';
import {hash} from '../../packages/core/project';

const resources=path.resolve('apps/workbench/public/references'),secrets={durable:false,get:()=>'',set:()=>{}};
const source='{"heroesVersion":37,"value":1,"list":[],"private":"outside scope","exact":9007199254740993}';
const references=[{section:'heroesVersion',schema:{_type:'literal',value:37}},{section:'value',schema:'number'}];
const tool=(id:string,name:string,args:any)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const response=(message:any)=>JSON.stringify({choices:[{message,finish_reason:'stop'}]});
const root=(service:Service,id:string)=>service.store.project(id).tasks.find(task=>!task.parentTaskId)!;
async function listen(server:Server){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+(server.address() as any).port+'/v1';}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
async function configure(service:Service,baseUrl:string){
 const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Fixture',protocol:'openai',baseUrl,model:'frozen-model'});settings.routes.building={profileId:'fixture',model:''};
 await service.request('saveProviderSettings',{settings});service.references=references;service.store.setting('localEditMode','proposal-only');
}
function prepared(service:Service,route:any,options:any={}){
 const id=service.store.create('Recovery',source).project!.id;
 service.store.dispatch(id,{type:'workOrder',order:{objective:'Update value',requirements:[],allowedPaths:[['value'],['list']]}});
 service.store.dispatch(id,{type:'prepareTask',id:'root',attempt:'original',kind:'work',prompt:'Continue saved work',route,autoResume:true,allowDelegation:true,localEditMode:'proposal-only',...options});
 service.store.dispatch(id,{type:'taskRunning',taskId:'root',attempt:'original'});return id;
}

test('API delegation waits for a scoped child, replays its receipt and keeps edits in the parent',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-delegation-'));let rootTurns=0,childTurns=0;
 const server=createServer(async(request,result)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw),packet=JSON.parse(body.messages[1].content);
  assert.equal(body.model,'frozen-model');let message:any;
  if(packet.role==='read-only-reviewer'){
   assert.doesNotMatch(body.messages[1].content,/outside scope/);
   assert.deepEqual(body.tools.map((entry:any)=>entry.function.name),['world_read','world_children','world_schema','world_schema_coverage']);
   message=childTurns++===0?{tool_calls:[tool('read','world_read',{path:['value']}),tool('outside','world_read',{path:['private']}),tool('mutate','world_edit',{action:'replace',path:['value'],source:'99'})]}:{content:'Advisory review: value can be updated.'};
  }else{
   if(rootTurns===0){const review=tool('review','delegate_review',{objective:'Review value',paths:[['value']]});message={tool_calls:[review,review]};}
   else if(rootTurns===1){const outputs=body.messages.filter((entry:any)=>entry.role==='tool').map((entry:any)=>JSON.parse(entry.content));assert.equal(outputs.length,2);assert.equal(outputs[0].advisory,true);assert.equal(outputs[0].summary,'Advisory review: value can be updated.');message={tool_calls:[tool('edit','world_edit',{action:'replace',path:['value'],source:'2'})]};}
   else message={content:'Updated the staged value.'};rootTurns++;
  }
  result.setHeader('Content-Type','application/json');result.end(response(message));
 });
 const url=await listen(server),service=new Service(directory,resources,secrets);
 try{
  await configure(service,url);const id=service.store.create('Delegate',source).project!.id;
  service.store.dispatch(id,{type:'workOrder',order:{objective:'Update value',requirements:[],allowedPaths:[['value']]}});
  await service.request('startAgent',{id,kind:'work',allowDelegation:true});const taskId=root(service,id).id;
  await service.orchestrator.running.get(id+':'+taskId);
  const project=service.store.project(id),parent=root(service,id),child=project.tasks.find(task=>task.parentTaskId===parent.id)!;
  assert.equal(parent.state,'PROPOSAL_READY',parent.error);assert.equal(child.state,'COMPLETED',child.error);assert.equal(childTurns,2);assert.equal(project.tasks.length,2);
  assert.equal(child.toolJournal!.filter(entry=>entry.state==='rejected').length,2);assert.equal(parent.toolJournal![0].state,'succeeded');assert.equal(project.activeSource,source);
  assert.match(project.candidates[0].source,/"value":2/);assert.equal(project.workOrderProposals?.length||0,0);
 }finally{service.store.close();await close(server);rmSync(directory,{recursive:true,force:true});}
});

test('canceling the root aborts an in-flight child and prevents late completion',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-delegation-cancel-'));let entered!:()=>void;const childEntered=new Promise<void>(resolve=>{entered=resolve;});
 const server=createServer(async(request,result)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw),packet=JSON.parse(body.messages[1].content);
  if(packet.role==='read-only-reviewer'){entered();return;}
  result.setHeader('Content-Type','application/json');result.end(response({tool_calls:[tool('review','delegate_review',{objective:'Review',paths:[['value']]})]}));
 });
 const url=await listen(server),service=new Service(directory,resources,secrets);
 try{
  await configure(service,url);const id=service.store.create('Cancel review',source).project!.id;
  service.store.dispatch(id,{type:'workOrder',order:{objective:'Review value',requirements:[],allowedPaths:[['value']]}});
  await service.request('startAgent',{id,kind:'work',allowDelegation:true});const taskId=root(service,id).id,execution=service.orchestrator.running.get(id+':'+taskId);
  await childEntered;await service.request('stopAgent',{id,taskId});await execution;
  const project=service.store.project(id);assert.ok(project.tasks.every(task=>task.state==='CANCELED'));assert.equal(project.activeSource,source);assert.equal(project.candidates.length,0);assert.equal(service.providers.running.size,0);
 }finally{service.store.close();await close(server);rmSync(directory,{recursive:true,force:true});}
});

test('service restart automatically continues a consented staged checkpoint with its frozen route',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-checkpoint-resume-'));let requests=0;
 const server=createServer(async(request,result)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw),packet=JSON.parse(body.messages[1].content);
  assert.equal(body.model,'original-model');assert.equal(packet.recovery.mode,'checkpoint-continuation');
  result.setHeader('Content-Type','application/json');result.end(response(requests++===0?{tool_calls:[tool('inspect','world_read',{path:['list']})]}:{content:'Saved checkpoint inspected; no duplicate insertion needed.'}));
 });
 const url=await listen(server);let service=new Service(directory,resources,secrets);
 try{
  const route={id:'fixture',name:'Frozen',protocol:'openai',baseUrl:url,model:'original-model',stage:'building'};
  const id=prepared(service,route);service.store.dispatch(id,{type:'taskTool',taskId:'root',attempt:'original',callId:'insert',name:'world_edit',args:{action:'insert',path:['list'],key:0,source:'9007199254740993'}});
  const staged=root(service,id).stagedSource;service.store.close();service=new Service(directory,resources,secrets);await service.recoveryReady;
  const task=root(service,id);assert.equal(task.state,'PROPOSAL_READY',task.error);assert.equal(task.resumes!.length,1);assert.equal(task.toolJournal!.length,2);assert.equal(requests,2);
  assert.equal(service.store.project(id).candidates[0].source,staged);assert.equal(task.resumes![0].sourceHash,hash(staged));assert.equal(service.store.project(id).activeSource,source);
 }finally{service.store.close();await close(server);rmSync(directory,{recursive:true,force:true});}
});

test('restart leaves nonconsenting, canceled and stale tasks stopped without provider calls',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-resume-guards-'));let calls=0;
 const server=createServer((_request,response)=>{calls++;response.end('{}');});const url=await listen(server);let service=new Service(directory,resources,secrets);
 try{
  const route={id:'fixture',name:'Frozen',protocol:'openai',baseUrl:url,model:'fixed',stage:'building'};
  const noConsent=prepared(service,route,{autoResume:false});
  const canceled=prepared(service,route);service.store.dispatch(canceled,{type:'taskStop',taskId:'root',attempt:'original',state:'CANCELED'});
  const stale=prepared(service,route);service.store.dispatch(stale,{type:'edit',path:['value'],source:'2',baseHash:hash(source)});
  service.store.close();service=new Service(directory,resources,secrets);await service.recoveryReady;
  assert.equal(calls,0);assert.equal(root(service,noConsent).state,'INTERRUPTED');assert.equal(root(service,canceled).state,'CANCELED');assert.match(root(service,stale).resumeBlockedReason!,/active world changed/);
 }finally{service.store.close();await close(server);rmSync(directory,{recursive:true,force:true});}
});

test('native RPC delegation settles both sessions before the orchestrator completes',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-rpc-delegation-')),previous=process.env.VOYAGE_CODEX_BINARY,executable=path.join(directory,'fake-codex');
 writeFileSync(executable,`#!${process.execPath}
let review=false;const send=value=>console.log(JSON.stringify(value));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const message=JSON.parse(line);if(message.method==='initialized')return;
if(message.id===900&&!message.method){if(!message.result.success)throw new Error('Tool failed');send({method:'item/agentMessage/delta',params:{delta:review?'Read-only findings.':'Reviewed.'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});return;}
if(message.method==='account/read'){send({id:message.id,result:{account:{type:'chatgpt'}}});return;}
if(message.method==='thread/start'){review=message.params.developerInstructions.includes('read-only delegated');send({id:message.id,result:{thread:{id:review?'child':'root'}}});return;}
send({id:message.id,result:{}});if(message.method==='turn/start')send({id:900,method:'item/tool/call',params:{callId:'same-id',tool:review?'world_read':'delegate_review',arguments:review?{path:['value']}:{objective:'Inspect value',paths:[['value']]}}});});
`,{mode:0o700});process.env.VOYAGE_CODEX_BINARY=executable;const service=new Service(directory,resources,secrets);
 try{
  const id=service.store.create('Native delegation',source).project!.id;service.store.dispatch(id,{type:'workOrder',order:{objective:'Review value',requirements:[],allowedPaths:[['value']]}});
  await service.request('startAgent',{id,kind:'work',allowDelegation:true});const taskId=root(service,id).id;await service.orchestrator.running.get(id+':'+taskId);
  const project=service.store.project(id);assert.equal(root(service,id).state,'COMPLETED',root(service,id).error);assert.equal(project.tasks.find(task=>task.parentTaskId)!.reply,'Read-only findings.');assert.equal(service.agent.running.size,0);
 }finally{service.store.close();if(previous===undefined)delete process.env.VOYAGE_CODEX_BINARY;else process.env.VOYAGE_CODEX_BINARY=previous;rmSync(directory,{recursive:true,force:true});}
});
