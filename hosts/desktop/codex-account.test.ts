import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CodexRpcError,readCodexAccount,Rpc,AgentHost} from './codex';
import {CodexMedia,type MediaRpc} from './codex-media';

const routing=()=>new CodexRpcError('account/read',-32603,'workspace routing discovery failed');
test('account recovery is bounded, account-only, and never forces credential refresh',async()=>{
 for(const failures of [0,1,2]){
  const calls:any[]=[];
  const request=async(method:string,params:any)=>{calls.push({method,params});if(calls.length<=failures)throw routing();return {account:{type:'chatgpt'}};};
  if(failures===2)await assert.rejects(readCodexAccount({request}),/own isolated Codex sign-in.*No task or image turn/);
  else assert.equal((await readCodexAccount({request})).account.type,'chatgpt');
  assert.deepEqual(calls,Array.from({length:failures===0?1:2},()=>({method:'account/read',params:{refreshToken:false}})));
 }
});
test('null account and unrelated errors do not trigger recovery',async()=>{
 let calls=0;assert.equal((await readCodexAccount({request:async()=>{calls++;return {account:null};}})).account,null);assert.equal(calls,1);
 for(const error of [new Error('workspace routing discovery failed'),new CodexRpcError('account/read',-32603,'workspace routing discovery unauthorized (401)'),new CodexRpcError('account/read',-32603,'account changed during workspace routing discovery'),new CodexRpcError('account/read',-32602,'workspace routing discovery failed'),new CodexRpcError('turn/start',-32603,'workspace routing discovery failed'),new Error('account/read timed out.')]){
  calls=0;await assert.rejects(readCodexAccount({request:async()=>{calls++;throw error;}}),reason=>reason===error);assert.equal(calls,1);
 }
});
test('media routing failure closes the session without starting threads or turns',async()=>{
 const calls:string[]=[];let closed=false;
 const rpc:MediaRpc={init:async()=>{},onEvent:()=>{},close:()=>{closed=true;},request:async(method)=>{calls.push(method);throw routing();}};
 const media=new CodexMedia('/unused','/unused',()=>rpc);
 await assert.rejects(media.run({id:'codex',name:'Codex',protocol:'codex',model:'',baseUrl:'',stage:'artwork'},'Inspect',[],false),/one account-only retry/);
 assert.deepEqual(calls,['account/read','account/read']);assert.equal(closed,true);assert.equal(media.busy,false);
});
test('recovered account permits only the explicitly requested turn; failed turns are never retried',async()=>{
 for(const failTurn of [false,true]){
  const calls:string[]=[];let reads=0;
  const rpc:MediaRpc={init:async()=>{},onEvent:()=>{},close:()=>{},request:async(method)=>{
   calls.push(method);
   if(method==='account/read'){if(++reads===1)throw routing();return {account:{type:'chatgpt'}};}
   if(method==='thread/start')return {thread:{id:'thread'}};
   if(method==='turn/start'){if(failTurn)throw routing();queueMicrotask(()=>rpc.onEvent('turn/completed',{threadId:'thread',turn:{status:'completed',items:[{type:'agentMessage',text:'Inspected'}]}}));return {};}
   throw new Error('Unexpected method '+method);
  }};
  const media=new CodexMedia('/unused','/unused',()=>rpc),run=media.run({id:'codex',name:'Codex',protocol:'codex',model:'',baseUrl:'',stage:'artwork'},'Inspect',[],false);
  if(failTurn)await assert.rejects(run,/workspace routing discovery failed/);else assert.equal((await run).text,'Inspected');
  assert.deepEqual(calls,['account/read','account/read','thread/start','turn/start']);
 }
});
test('wire errors retain method and code; planner artwork dispatch only creates an approval proposal',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-account-wire-')),previous=process.env.VOYAGE_CODEX_BINARY;
 const fixture=`const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const message=JSON.parse(line);if(message.id===undefined)return;const response=message.method==='account/read'?{error:{code:-32603,message:'workspace routing discovery failed'}}:{result:{}};console.log(JSON.stringify({id:message.id,...response}));});`;
 // Rpc invokes "app-server" from each work directory. Node runs that fixture on
 // every platform without a Unix shebang or a Windows shell wrapper.
 for(const cwd of [directory,path.join(directory,'tasks','task')]){mkdirSync(cwd,{recursive:true});writeFileSync(path.join(cwd,'app-server'),fixture);}
 process.env.VOYAGE_CODEX_BINARY=process.execPath;
 let rpc:Rpc|undefined;const processes=new Set<Rpc>();
 try{
  rpc=new Rpc(path.join(directory,'home'),directory);processes.add(rpc);await rpc.init();
  await assert.rejects(rpc.request('account/read',{refreshToken:false}),error=>error instanceof CodexRpcError&&error.code===-32603&&error.method==='account/read');rpc.close();
  const commands:any[]=[],task:any={id:'task',attempt:'attempt',kind:'plan',state:'RUNNING',baseSource:'{}'};
  const store:any={directory,project:()=>({tasks:[task]}),dispatch:(_project:string,command:any)=>commands.push(command)};
  const host=new AgentHost(store,path.join(directory,'home'),()=>[]);let taskRpc:Rpc|undefined;const initialize=Rpc.prototype.init;
  Rpc.prototype.init=async function(){taskRpc=this;processes.add(this);return initialize.call(this);};
  try{await host.run('project','task');}finally{Rpc.prototype.init=initialize;}
  assert.equal(commands.at(-1).state,'FAILED');assert.match(commands.at(-1).error,/one account-only retry/);
  assert.equal(commands.some(command=>command.type==='taskSession'),false);assert.equal(host.running.size,0);
  const request={destinationId:'cover',prompt:'A misty harbor'};
  const result=await taskRpc!.onTool('propose_artwork',request);
  assert.match(result.proposalId,/^[0-9a-f-]{36}$/);assert.deepEqual(result,{proposalId:result.proposalId,awaitingHumanApproval:true,activeWorldUnchanged:true,generated:false});
  assert.deepEqual(commands.at(-1),{type:'proposeArtwork',id:result.proposalId,taskId:'task',attempt:'attempt',request});
  task.kind='work';await assert.rejects(taskRpc!.onTool('propose_artwork',request),/unavailable for this stage/);
  task.state='CANCELED';await assert.rejects(taskRpc!.onTool('propose_artwork',request),/Task was stopped/);
  for(const invalidation of ['cancel','new-attempt','cancel-after-thread']){
   task.kind='plan';task.state='RUNNING';task.attempt='attempt';const calls:string[]=[];let reads=0;const original=Rpc.prototype.request;
   Rpc.prototype.request=async function(method){
    processes.add(this);
    calls.push(method);if(method==='initialize')return {};
    if(method==='account/read'){if(++reads===1)throw routing();if(invalidation==='cancel')task.state='CANCELED';if(invalidation==='new-attempt')store.project=()=>({tasks:[{...task,attempt:'new-attempt'}]});return {account:{type:'chatgpt'}};}
    if(method==='thread/start'){task.state='CANCELED';return {thread:{id:'thread'}};}
    throw new Error('Unexpected request '+method);
   };
   try{await host.run('project','task');}finally{Rpc.prototype.request=original;store.project=()=>({tasks:[task]});}
   assert.equal(calls.includes('turn/start'),false);assert.equal(calls.includes('thread/start'),invalidation==='cancel-after-thread');assert.equal(commands.at(-1).error,'Task was stopped.');
  }
 }finally{
  for(const child of processes)child.close();
  await Promise.all([...processes].map(({process:child})=>child.exitCode!==null||child.signalCode!==null?undefined:new Promise<void>(resolve=>child.once('exit',()=>resolve()))));
  if(previous===undefined)delete process.env.VOYAGE_CODEX_BINARY;else process.env.VOYAGE_CODEX_BINARY=previous;
  rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 }
});
