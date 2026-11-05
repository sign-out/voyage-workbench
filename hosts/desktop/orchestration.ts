import {randomUUID} from 'node:crypto';
import {hash} from '../../packages/core/project';
import {resumeIssue,taskGroup} from '../../packages/core/agent-orchestration';
import {dispatchWorldTool} from './world-tools';
import type {Store} from './store';
import type {AgentHost} from './codex';
import type {ProviderHost} from './providers';

export class AgentOrchestrator {
 readonly running=new Map<string,Promise<void>>();
 constructor(public store:Store,public agent:AgentHost,public providers:ProviderHost){
  const execute=this.tool.bind(this);agent.executeTool=execute;providers.executeTool=execute;
 }
 run(projectId:string,taskId:string):Promise<void>{
  const key=projectId+':'+taskId,existing=this.running.get(key);if(existing)return existing;
  const execution=Promise.resolve().then(async()=>{
   const task=this.store.project(projectId).tasks.find(entry=>entry.id===taskId);if(!task||task.state!=='PREPARED')return;
   try{
    if(task.route?.protocol==='codex')await new Promise<void>((resolve,reject)=>{void this.agent.run(projectId,taskId,resolve).catch(reject);});
    else await this.providers.run(projectId,taskId);
    const current=this.store.project(projectId).tasks.find(entry=>entry.id===taskId);
    if(current?.attempt===task.attempt&&['PREPARED','RUNNING'].includes(current.state))this.stop(projectId,taskId,'FAILED','Provider stopped without a committed completion.');
    else if(!task.parentTaskId&&current?.attempt===task.attempt)this.stop(projectId,taskId,current.state,current.error||'Parent task settled.');
   }catch(error){
    const current=this.store.project(projectId).tasks.find(entry=>entry.id===taskId);
    if(current?.attempt===task.attempt&&['PREPARED','RUNNING'].includes(current.state))this.stop(projectId,taskId,'FAILED',(error as Error).message);
   }
  }).finally(()=>{this.running.delete(key);});
  this.running.set(key,execution);return execution;
 }
 async tool(projectId:string,taskId:string,attempt:string,callId:string,name:string,args:any){
  const result=dispatchWorldTool(this.store,projectId,taskId,attempt,callId,name,args);
  if(name!=='delegate_review'||!result.pending)return result;
  const signal=this.providers.running.get(taskId)?.abort.signal;
  const abortChild=()=>this.stop(projectId,result.taskId);
  signal?.addEventListener('abort',abortChild,{once:true});
  try{if(signal?.aborted)abortChild();await this.run(projectId,result.taskId);}finally{signal?.removeEventListener('abort',abortChild);}
  const response=this.store.dispatch(projectId,{type:'resolveDelegation',taskId,attempt,childTaskId:result.taskId});
  const receipt=response.project!.tasks.find(entry=>entry.id===taskId)?.toolJournal?.find(entry=>entry.id===callId&&entry.attempt===attempt);
  if(!receipt||receipt.state==='pending')throw new Error('Delegated result was not committed.');
  if(receipt.state==='rejected')throw new Error(receipt.result.error);
  return receipt.result;
 }
 stop(projectId:string,taskId:string,state='CANCELED',error='Stopped by user.'){
  const project=this.store.project(projectId),task=project.tasks.find(entry=>entry.id===taskId);if(!task)throw new Error('Task not found.');
  this.store.dispatch(projectId,{type:'taskStop',taskId,attempt:task.attempt,state,error});
  for(const entry of task.parentTaskId?[task]:taskGroup(project,task)){
   if(this.providers.running.has(entry.id))this.providers.cancel(projectId,entry.id);
   if(this.agent.running.has(entry.id))this.agent.cancel(projectId,entry.id);
  }
  return this.store.get(projectId);
 }
 async resume(projectId:string,taskId:string){
  const project=this.store.project(projectId),task=project.tasks.find(entry=>entry.id===taskId);if(!task)throw new Error('Task not found.');
  const live=this.running.has(projectId+':'+taskId)||this.providers.running.has(taskId)||this.agent.running.has(taskId);
  const issue=live?'The prior provider process is still active. Stop it before continuing.':resumeIssue(project,task,'desktop',hash);
  if(issue){this.store.dispatch(projectId,{type:'taskRecoveryBlocked',taskId,reason:issue});return;}
  this.store.dispatch(projectId,{type:'resumeTask',taskId,attempt:task.attempt,newAttempt:randomUUID()});
  await this.run(projectId,taskId);
 }
 async recover(){
  const jobs:Promise<void>[]=[];
  for(const row of this.store.list()){
   const project=this.store.project(row.id as string);
   const task=project.tasks.find(entry=>!entry.parentTaskId&&entry.state==='INTERRUPTED'&&entry.policy?.autoResume);
   if(task)jobs.push(this.resume(project.id,task.id));
  }
  await Promise.all(jobs);
 }
}
