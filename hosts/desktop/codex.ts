import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {Store} from './store';
import {randomUUID} from 'node:crypto';
import {AssistantRecoveryBudget} from '../../packages/core/assistant-recovery';
import {assistantCompletionValidation} from '../../packages/core/project';
import * as doc from '../../packages/core/document';
import {modelCatalog} from '../../packages/core/model-catalog';
import {readBuilderNotes,type Task} from '../../packages/core/project';
const disabled=['shell_tool','unified_exec','plugins','remote_plugin','apps','hooks','browser_use','browser_use_external','computer_use','view_image','multi_agent','multi_agent_v2','workspace_dependencies','skill_search','skill_mcp_dependency_install','image_generation','memories','goals','sleep_tool','recommended_plugins','code_mode','code_mode_only'];
export function binary(){const custom=process.env.VOYAGE_CODEX_BINARY;if(custom&&existsSync(custom))return custom;
  const dirs=(process.env.PATH||'').split(path.delimiter).concat([path.join(os.homedir(),'.local','bin'),path.join(os.homedir(),'.t3','tools','codex','0.156.1','bin'),path.join(process.env.APPDATA||'','npm')]);
  for(const dir of dirs)for(const name of process.platform==='win32'?['codex.exe','codex.cmd']:['codex']){const file=path.join(dir,name);if(existsSync(file))return file;}throw new Error('Codex CLI was not found. Install Codex, then restart Workbench.');}
export class CodexRpcError extends Error {
  constructor(public method:string,public code:number,message:string){super(message);this.name='CodexRpcError';}
}
export async function readCodexAccount(rpc:Pick<Rpc,'request'>){
  for(let attempt=0;attempt<2;attempt++){
    try{return await rpc.request('account/read',{refreshToken:false});}
    catch(error){
      if(!(error instanceof CodexRpcError)||error.method!=='account/read'||error.code!==-32603||error.message!=='workspace routing discovery failed')throw error;
      if(attempt===1)throw new Error('Codex account verification failed: workspace routing discovery failed (account/read, -32603), including one account-only retry. This may be a network, DNS, TLS, proxy, or Codex service issue; it does not prove you are signed out. Check connectivity and retry Connection. Workbench uses its own isolated Codex sign-in. No task or image turn was started by this account check; restart failed work explicitly.');
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }
}
export class Rpc {
  process:ChildProcessWithoutNullStreams;next=1;pending=new Map<number,{method:string;resolve:(r:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  onEvent:(method:string,params:any)=>void=()=>{};onTool:(tool:string,args:any)=>Promise<any>=async()=>{throw new Error('No tool handler');};
  constructor(home:string,cwd:string){mkdirSync(home,{recursive:true});mkdirSync(cwd,{recursive:true});
    writeFileSync(path.join(home,'config.toml'),'approval_policy="never"\nsandbox_mode="read-only"\nweb_search="disabled"\nproject_doc_max_bytes=0\n[features]\n'+disabled.map(k=>k+'=false').join('\n')+'\ncode_mode_host=true\n');
    const env:NodeJS.ProcessEnv={};for(const key of ['HOME','USERPROFILE','PATH','LANG','SYSTEMROOT','WINDIR','COMSPEC','APPDATA','LOCALAPPDATA','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];env.CODEX_HOME=home;
    const executable=binary();const args=['app-server','--listen','stdio://'];
    this.process=spawn(executable,args,{cwd,env,windowsHide:true,shell:process.platform==='win32'&&executable.endsWith('.cmd')});
    createInterface({input:this.process.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(m.id!==undefined&&!m.method){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new CodexRpcError(p.method,m.error.code,m.error.message)):p.resolve(m.result);}}else if(m.id!==undefined){void this.answer(m);}else this.onEvent(m.method,m.params||{});}catch{}});
    this.process.stderr.on('data',()=>{});
    const ended=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Codex process stopped.'));}this.pending.clear();this.onEvent('host/exited',{});};
    this.process.on('error',ended);this.process.on('exit',ended);
  }
  send(m:any){if(!this.process.stdin.writable)throw new Error('Codex is not running.');this.process.stdin.write(JSON.stringify(m)+'\n');}
  request(method:string,params:any={},timeout=60000):Promise<any>{const id=this.next++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(method+' timed out.'));},timeout);this.pending.set(id,{method,resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  async init(){const r=await this.request('initialize',{clientInfo:{name:'voyage_workbench',version:'0.1.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized',params:{}});return r;}
  private async answer(m:any){try{if(m.method!=='item/tool/call')throw new Error('This host does not allow '+m.method);const result=await this.onTool(m.params.tool,m.params.arguments);this.send({id:m.id,result:{success:true,contentItems:[{type:'inputText',text:JSON.stringify(result)}]}});}catch(e){try{this.send({id:m.id,result:{success:false,contentItems:[{type:'inputText',text:String((e as Error).message)}]}});}catch{}}}
  close(){this.process.kill();setTimeout(()=>{if(this.process.exitCode===null)this.process.kill('SIGKILL');},1500).unref();}
}
export {toolDefinitions} from '../../packages/core/providers';
import {toolDefinitions,agentSystem} from '../../packages/core/providers';
import {assistantPacket} from '../../packages/core/assistant-context';
export class AgentHost {
  running=new Map<string,{rpc:Rpc;task:Task;threadId?:string}>();loginRpc?:Rpc;login:any=null;
  createRpc=(home:string,cwd:string)=>new Rpc(home,cwd);
  constructor(public store:Store,public home:string,public references:()=>any[]){ }
  async models(){const rpc=new Rpc(this.home,path.join(this.store.directory,'auth'));try{await rpc.init();const models:any[]=[];let cursor:string|undefined;for(let page=0;page<20;page++){const result=await rpc.request('model/list',{limit:100,...(cursor?{cursor}:{}),includeHidden:false},20000);models.push(...result.data);if(!result.nextCursor)return modelCatalog(models);if(result.nextCursor===cursor)throw new Error('Model catalog pagination did not advance.');cursor=result.nextCursor;}throw new Error('Model catalog exceeds the supported page limit.');}finally{rpc.close();}}
  async auth(){try{const rpc=new Rpc(this.home,path.join(this.store.directory,'auth'));try{await rpc.init();const r=await readCodexAccount(rpc);return {available:true,account:r.account,login:this.login};}finally{rpc.close();}}catch(e){return {available:false,error:(e as Error).message,login:this.login};}}
  async loginStart(){this.loginRpc?.close();const rpc=new Rpc(this.home,path.join(this.store.directory,'auth'));this.loginRpc=rpc;rpc.onEvent=(method,p)=>{if(method==='account/login/completed'){this.login={...this.login,complete:p.success,error:p.error};rpc.close();}};await rpc.init();this.login=await rpc.request('account/login/start',{type:'chatgptDeviceCode'});return this.login;}
  async logout(){const rpc=new Rpc(this.home,path.join(this.store.directory,'auth'));try{await rpc.init();await rpc.request('account/logout');this.login=null;}finally{rpc.close();}return {ok:true};}
  async run(projectId:string,taskId:string){const project=this.store.project(projectId),task=project.tasks.find(t=>t.id===taskId);if(!task)throw new Error('Task not found.');
    const cwd=path.join(this.store.directory,'tasks',task.id);mkdirSync(cwd,{recursive:true});writeFileSync(path.join(cwd,'world.json'),task.baseSource);
    let rpc:Rpc;try{rpc=this.createRpc(this.home,cwd);}catch(e){this.store.dispatch(projectId,{type:'taskStop',taskId,state:'FAILED',error:(e as Error).message});return;}
    this.running.set(task.id,{rpc,task});this.store.dispatch(projectId,{type:'taskRunning',taskId,attempt:task.attempt});let reply='',lastFlush=0,done=false;
    const recovery=new AssistantRecoveryBudget(task.assistantRecovery);
    const finish=(error?:string)=>{if(done)return;done=true;clearTimeout(timeout);try{this.store.dispatch(projectId,error?{type:'taskStop',taskId,attempt:task.attempt,state:'FAILED',error}:{type:'taskDone',taskId,attempt:task.attempt,text:reply});}catch(failure){try{this.store.dispatch(projectId,{type:'taskStop',taskId,attempt:task.attempt,state:'FAILED',error:(failure as Error).message});}catch{}}if(this.running.get(task.id)?.rpc===rpc)this.running.delete(task.id);rpc.close();};
    const ensureRunning=()=>{const current=this.store.project(projectId).tasks.find(current=>current.id===taskId);if(done||this.running.get(taskId)?.rpc!==rpc||current?.state!=='RUNNING'||current.attempt!==task.attempt)throw new Error('Task was stopped.');};
    const timeout=setTimeout(()=>finish('The task exceeded its 30-minute limit. Restart explicitly if needed.'),30*60*1000);timeout.unref();
    rpc.onEvent=(method,p)=>{
      if(method==='item/agentMessage/delta'){reply+=p.delta||'';if(Date.now()-lastFlush>1000){lastFlush=Date.now();try{this.store.dispatch(projectId,{type:'taskReply',taskId,attempt:task.attempt,text:reply});}catch{}}}
      if(method==='turn/completed'){
        if(p.turn?.status!=='completed'){finish(p.turn?.error?.message||'The provider interrupted this task.');return;}
        try{ensureRunning();assistantCompletionValidation(this.store.project(projectId),task,reply);}
        catch(error){
          try{ensureRunning();const correction=recovery.correctiveOpportunity(error);reply='';this.store.dispatch(projectId,{type:'taskReply',taskId,attempt:task.attempt,text:reply});const threadId=this.running.get(taskId)!.threadId;if(!threadId)throw new Error('Task session no longer exists.');void rpc.request('turn/start',{threadId,input:[{type:'text',text:JSON.stringify(correction),text_elements:[]}]}).catch(error=>finish(error.message));}
          catch(failure){finish((failure as Error).message);}return;
        }
        finish();
      }
      if(method==='host/exited'){clearTimeout(timeout);finish('Codex stopped before finishing.');}
    };
    const executeTool=(name:string,args:any)=>{const current=this.store.project(projectId).tasks.find(t=>t.id===task.id)!;const source=current.kind==='work'?current.stagedSource:current.baseSource;
      if(name==='world_read'){const s=doc.read(source,args.path);if(s.length>100000)throw new Error('This section is too large for a single read. Use world_children and read smaller paths.');return {source:s};}
      if(name==='world_children'){const result=doc.describe(source,args.path);return {kind:result.kind,children:result.children.slice(0,500),truncated:result.children.length>500};}
      if(name==='world_search')return doc.search(source,args.query);
      if(name==='world_validate')return doc.validate(source,this.references());
      if(name==='world_schema')return this.references().filter(r=>r.section===args.section).slice(0,3);
      if(name==='world_notes')return readBuilderNotes(current.builderNotes||[],args.path,args.offset||0);
      if(name==='record_note_plan'){this.store.dispatch(projectId,{type:'recordNotePlan',taskId,attempt:task.attempt,noteId:args.noteId,state:args.state,explanation:args.explanation,proposalId:args.proposalId});return {recorded:true,awaitingHumanReview:true};}
      if(name==='propose_artwork'){if(current.kind!=='plan')throw new Error('Tool is unavailable for this stage');const id=randomUUID();this.store.dispatch(projectId,{type:'proposeArtwork',id,taskId,attempt:task.attempt,request:args});return {proposalId:id,awaitingHumanApproval:true,activeWorldUnchanged:true,generated:false};}
      if(name==='propose_work_order'){const id=randomUUID();this.store.dispatch(projectId,{type:'proposeWorkOrder',id,taskId,attempt:task.attempt,order:args});return {proposalId:id,awaitingHumanApproval:true,activeWorldUnchanged:true};}
      if(name==='world_checkpoint'){const saved=this.store.dispatch(projectId,{type:'taskSectionCheckpoint',taskId,attempt:task.attempt,label:args.label,paths:args.paths});return {checkpoint:saved.project!.tasks.find(value=>value.id===taskId)!.sectionCheckpoints!.at(-1),staged:true,activeWorldUnchanged:true,localOnly:true};}
      if(name==='world_edit'){this.store.dispatch(projectId,{...args,type:'taskEdit',taskId,attempt:task.attempt});return {staged:true,activeWorldUnchanged:true};}
      throw new Error('Unknown tool');
    };
    rpc.onTool=async(name,args)=>{
      try{ensureRunning();if(!toolDefinitions(task.kind==='work',!!task.grading,!!task.fieldFill).some(tool=>tool.name===name))throw new Error('Tool is unavailable for this stage.');return recovery.tool(()=>{if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Tool arguments must be an object. Correct the tool argument JSON.');return executeTool(name,args);},ensureRunning);}
      catch(error){finish((error as Error).message);throw error;}
    };
    try{await rpc.init();const account=await readCodexAccount(rpc);if(!account.account)throw new Error('Sign into Codex in Connection first.');
      ensureRunning();
      const result=await rpc.request('thread/start',{cwd,...(task.route?.model?{model:task.route.model}:{}),approvalPolicy:'never',sandbox:'read-only',dynamicTools:toolDefinitions(task.kind==='work',!!task.grading,!!task.fieldFill),environments:[],developerInstructions:agentSystem(task.kind==='work',!!task.grading,!!task.fieldFill)});
      ensureRunning();
      this.running.get(task.id)!.threadId=result.thread.id;this.store.dispatch(projectId,{type:'taskSession',taskId,attempt:task.attempt,sessionId:result.thread.id});
      const packet=assistantPacket(project,task);
      await rpc.request('turn/start',{threadId:result.thread.id,input:[{type:'text',text:JSON.stringify(packet),text_elements:[]}]});
    }catch(e){clearTimeout(timeout);finish((e as Error).message);}
  }
  cancel(projectId:string,taskId:string){this.store.dispatch(projectId,{type:'taskStop',taskId,state:'CANCELED'});const entry=this.running.get(taskId);entry?.rpc.close();this.running.delete(taskId);return this.store.get(projectId);}
}
