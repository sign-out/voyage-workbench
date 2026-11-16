import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AgentHost} from './codex';
import {codexLoginStarting,codexLoginStarted,codexLoginEvent,codexLoginExpire,codexLoginFinish,codexLoginNeedsAuthentication} from '../../packages/core/codex-login';

const response={type:'chatgptDeviceCode',loginId:'login-one',verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-1234'};
const signedIn={account:{type:'chatgpt',email:'fixture@example.invalid'}};
test('Codex reuses auth before new sign-in, deduplicates pending attempts and cleans up only the owned login without automatic session-limit retries',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-codex-login-')),calls:{method:string;params:any;rpc:number}[]=[],children:any[]=[];
 const host=new AgentHost({directory} as any,path.join(directory,'home'),()=>[]);
 let account:any=signedIn,startError:Error|undefined,early=false,waitAccount:Promise<any>|undefined,waitCancel:Promise<any>|undefined;
 host.createRpc=()=>{
  const index=children.length,child:any={closed:0,onEvent:()=>{},init:async()=>{},close:()=>{child.closed++;child.onEvent('host/exited',{});},request:async(method:string,params:any)=>{
   calls.push({method,params,rpc:index});
   if(method==='account/read')return waitAccount?await waitAccount:account;
   if(method==='account/login/start'){if(startError)throw startError;if(early){account=signedIn;child.onEvent('account/login/completed',{loginId:response.loginId,success:true});}return response;}
   if(method==='account/login/cancel')return waitCancel?await waitCancel:{};
   if(method==='account/logout'){account={account:null};return {};}
   throw Error('Unexpected request '+method);
  }};children.push(child);return child;
 };
 const count=(method:string)=>calls.filter(call=>call.method===method).length;
 try{
  writeFileSync(path.join(directory,'auth-sentinel'),'existing-credentials-untouched');
  const reused=await host.loginStart();assert.equal(reused?.state,'complete');assert.equal(reused?.reused,true);assert.equal(count('account/login/start'),0);assert.equal(children[0].closed,1);
  account={account:null};let release!:(value:any)=>void;waitAccount=new Promise(resolve=>{release=resolve;});
  const first=host.loginStart();const duplicate=await host.loginStart();assert.equal(duplicate?.state,'starting');assert.equal(children.length,2);release({account:null});waitAccount=undefined;
  const pending=await first;assert.equal(pending?.state,'waiting');assert.equal(count('account/login/start'),1);
  for(let index=0;index<5;index++)assert.equal(host.loginStatus()?.attempt,pending?.attempt);assert.equal(count('account/login/start'),1);
  children[1].onEvent('account/login/completed',{loginId:'other-login',success:true});assert.equal(host.loginStatus()?.state,'waiting');
  assert.equal((await host.loginCancel('another-attempt'))?.state,'waiting');assert.equal(count('account/login/cancel'),0);
  let releaseCancel!:(value:any)=>void;waitCancel=new Promise(resolve=>{releaseCancel=resolve;});const cancel=host.loginCancel(pending!.attempt);assert.equal(host.loginStatus()?.state,'canceled');assert.equal(host.loginStatus()?.userCode,undefined);
  const next=host.loginStart();await Promise.resolve();assert.equal(children.length,2,'A new login process started before cancellation settled');releaseCancel({});waitCancel=undefined;await cancel;
  const newer=await next;assert.equal(newer?.state,'waiting');assert.notEqual(newer?.attempt,pending?.attempt);assert.equal(count('account/login/start'),2);
  children[1].onEvent('account/login/completed',{loginId:response.loginId,success:true});assert.equal(host.loginStatus()?.attempt,newer?.attempt);assert.equal(host.loginStatus()?.state,'waiting');
  const logout=await host.logout();assert.equal(logout.ok,true);assert.equal(host.loginStatus(),null);assert.equal(count('account/logout'),1);assert.deepEqual(calls.filter(call=>call.method==='account/login/cancel').map(call=>call.params),[{loginId:response.loginId},{loginId:response.loginId}]);
  early=true;const completed=await host.loginStart();assert.equal(completed?.state,'complete');assert.equal(completed?.userCode,undefined);assert.equal(completed?.verificationUrl,undefined);assert.ok(calls.filter(call=>call.method==='account/read').every(call=>call.params.refreshToken===false));early=false;
  account={account:null};startError=Error('Codex active session limit reached');const before=count('account/login/start'),failed=await host.loginStart();assert.equal(failed?.state,'failed');assert.match(failed!.error!,/active session limit/);for(let index=0;index<4;index++)host.loginStatus();await host.auth();assert.equal(count('account/login/start'),before+1);assert.equal(count('account/logout'),1,'The session limit triggered an automatic logout');startError=undefined;
  account={};const malformed=await host.loginStart();assert.equal(malformed?.state,'failed');assert.match(malformed!.error!,/No new sign-in session/);assert.equal(count('account/login/start'),before+1);
  account=signedIn;let finishStatus!:(value:any)=>void;waitAccount=new Promise(resolve=>{finishStatus=resolve;});const firstStatus=host.auth(),secondStatus=host.auth(),processes=children.length;finishStatus(signedIn);waitAccount=undefined;assert.deepEqual(await firstStatus,await secondStatus);assert.equal(children.length,processes);
  let finishOldStatus!:(value:any)=>void;waitAccount=new Promise(resolve=>{finishOldStatus=resolve;});const stale=host.auth();await Promise.resolve();await host.logout();waitAccount=undefined;const afterLogout=await host.auth();assert.equal(afterLogout.account,null,'A pre-logout status check remained authoritative');finishOldStatus(signedIn);await stale;
  assert.equal(readFileSync(path.join(directory,'auth-sentinel'),'utf8'),'existing-credentials-untouched');
  const initial=codexLoginStarting('attempt',1),waiting=codexLoginStarted(initial,response,2);
  assert.equal(codexLoginEvent(waiting,{loginId:'wrong',success:true},3),waiting);
  for(const terminal of [codexLoginFinish(waiting,'canceled','',3),codexLoginExpire(waiting,waiting.expiresAt)]){assert.equal(terminal.userCode,undefined);assert.equal(terminal.verificationUrl,undefined);assert.equal(codexLoginEvent(terminal,{loginId:response.loginId,success:true},4),terminal);}
  assert.equal(codexLoginNeedsAuthentication({account:null,requiresOpenaiAuth:false}),false);assert.throws(()=>codexLoginNeedsAuthentication({}),/No new sign-in/);
  assert.ok(children.every(child=>child.closed===1),'A login or status process leaked or closed twice');
 }finally{await host.loginCancel();rmSync(directory,{recursive:true,force:true});}
});
