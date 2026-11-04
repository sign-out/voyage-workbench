import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash,nativeRequest,type Project} from './project';
import {orchestrationCapabilities,resumeIssue,taskToolCapabilities,groupJournal,toolJournalLimits} from './agent-orchestration';
import {toolDefinitions} from './agent-tools';
import {assistantPacket} from './assistant-context';

const source='{"heroesVersion":37,"value":1,"list":[],"private":"outside scope","exact":9007199254740993}';
const route={id:'provider',name:'Provider',protocol:'openai',baseUrl:'http://localhost:1234/v1',model:'fixed-model',stage:'building'};
const references=[{section:'heroesVersion',schema:{_type:'literal',value:37}},{section:'value',schema:'number'}];
function running(options:any={}){
 let project=create('project','Orchestration',source,1);
 project=reduce(project,{type:'workOrder',order:{objective:'Update value',requirements:[],allowedPaths:[['value'],['list']]}});
 project=reduce(project,{type:'prepareTask',id:'root',attempt:'attempt',kind:'work',prompt:'Update',route,hostPlatform:'desktop',autoResume:true,allowDelegation:true,...options,now:2});
 return reduce(project,{type:'taskRunning',taskId:'root',attempt:'attempt',now:3});
}
const root=(project:Project)=>project.tasks.find(task=>task.id==='root')!;
function call(project:Project,callId:string,name:string,args:any,taskId='root'){
 const task=project.tasks.find(task=>task.id===taskId)!;
 return reduce(project,{type:'taskTool',taskId,attempt:task.attempt,callId,name,args,references,now:4});
}
const interrupt=(project:Project)=>reduce(project,{type:'recover',now:5});
const resume=(project:Project,newAttempt='continued')=>reduce(project,{type:'resumeTask',taskId:'root',attempt:root(project).attempt,newAttempt,hostPlatform:'desktop',now:6});

test('orchestration is explicit, capability-gated and restricted to work tasks',()=>{
 assert.equal(orchestrationCapabilities('desktop','openai').delegation,true);
 assert.equal(orchestrationCapabilities('android','openai').checkpointResume,true);
 assert.equal(orchestrationCapabilities('android','openai').delegation,false);
 assert.equal(orchestrationCapabilities('desktop','unknown').delegation,false);
 assert.equal(orchestrationCapabilities('desktop','codex').providerSessionResume,false);
 assert.throws(()=>running({hostPlatform:'android'}),/unavailable/);
 assert.throws(()=>running({kind:'plan'}),/approved work/);
 assert.throws(()=>running({autoResume:'yes'}),/boolean/);
 assert.equal(taskToolCapabilities(root(running({autoResume:false,allowDelegation:false}))).delegation,false);
 assert.ok(!toolDefinitions(true).some(tool=>tool.name==='delegate_review'));
 assert.ok(toolDefinitions(true,{delegation:true}).some(tool=>tool.name==='delegate_review'));
});

test('checkpoint continuation keeps original baseline, staged edits, receipts and fixed route',()=>{
 let project=call(running(),'edit','world_edit',{action:'insert',path:['list'],key:0,source:'9007199254740993'});
 const staged=root(project).stagedSource,receipt=root(project).toolJournal![0];
 project=resume(interrupt(project));
 assert.equal(root(project).state,'PREPARED');assert.equal(root(project).baseSource,source);assert.equal(root(project).stagedSource,staged);
 assert.deepEqual(root(project).route,route);assert.deepEqual(root(project).toolJournal![0],receipt);assert.equal(root(project).resumes![0].sourceHash,hash(staged));
 const packet=assistantPacket(project,root(project));assert.equal(packet.recovery!.mode,'checkpoint-continuation');assert.match(JSON.stringify(packet),/Do not repeat insert\/remove/);
 project=reduce(project,{type:'taskRunning',taskId:'root',attempt:'continued'});
 assert.throws(()=>reduce(project,{type:'taskTool',taskId:'root',attempt:'attempt',callId:'late',name:'world_read',args:{path:['value']}}));
 project=call(project,'edit','world_read',{path:['list']});assert.equal(root(project).toolJournal!.length,2);assert.equal(root(project).toolJournal![1].attempt,'continued');
 assert.equal(project.activeSource,source);assert.equal((staged.match(/9007199254740993/g)||[]).length,2);
});

test('automatic continuation rejects cancellation, changed worlds, drafts, stale routes and newer work',()=>{
 const initial=interrupt(running());
 for(const mutate of [
  (project:Project)=>{root(project).state='CANCELED';},
  (project:Project)=>{project.activeSource=source.replace('"value":1','"value":2');},
  (project:Project)=>{project.draft={path:['value'],text:'3',baseHash:hash(source)};},
  (project:Project)=>{root(project).route={...root(project).route!,model:'different'};},
  (project:Project)=>{root(project).policy!.autoResume=false;},
  (project:Project)=>{project.status='archived';},
  (project:Project)=>{root(project).stagedSource=source.replace('outside scope','bad change');},
  (project:Project)=>{root(project).toolSummary={calls:1,rejected:0};},
  (project:Project)=>{project.candidates.push({id:'root',title:'Partial',source,baseHash:hash(source),created:5,kind:'partial'});},
  (project:Project)=>{project.tasks.unshift({...root(project),id:'newer',state:'COMPLETED'});}
 ]){
  const project=JSON.parse(JSON.stringify(initial));mutate(project);assert.ok(resumeIssue(project,root(project),'desktop',hash));assert.throws(()=>resume(project));
 }
});

test('resumption is bounded across host restarts and cannot reuse an old attempt',()=>{
 let project=resume(interrupt(running()),'second');
 assert.throws(()=>resume(interrupt(project),'attempt'),/fresh/);
 project=resume(interrupt(project),'third');assert.equal(root(project).resumes!.length,2);
 assert.throws(()=>resume(interrupt(project),'fourth'),/two-continuation/);
});

test('Android checkpoint continuation uses the same native eligibility contract without enabling delegation',()=>{
 const project=interrupt(running({hostPlatform:'android',allowDelegation:false}));
 const guidance=JSON.parse(nativeRequest(JSON.stringify({operation:'resumeGuidance',args:[project,'root','android']})));
 assert.equal(guidance.allowed,true);
 const continued=reduce(project,{type:'resumeTask',taskId:'root',attempt:'attempt',newAttempt:'android-continued',hostPlatform:'android',now:6});
 assert.equal(root(continued).state,'PREPARED');assert.equal(root(continued).preparedAt,6);assert.equal(root(continued).policy!.allowDelegation,false);
 assert.throws(()=>reduce(project,{type:'resumeTask',taskId:'root',newAttempt:'missing-attempt',hostPlatform:'android'}),/interrupted task attempt/);
});

test('delegated review is durable, same-route, scoped, read-only and deduplicated',()=>{
 let project=call(running(),'delegate','delegate_review',{objective:'Review value',paths:[['value']]});
 const child=project.tasks.find(task=>task.parentTaskId==='root')!;
 assert.equal(root(project).toolJournal![0].state,'pending');assert.equal(child.kind,'review');assert.deepEqual(child.route,route);assert.equal(child.baseHash,hash(source));
 const packet=assistantPacket(project,child);assert.equal(packet.memory,'');assert.deepEqual(packet.history,[]);assert.doesNotMatch(JSON.stringify(packet),/outside scope/);
 assert.deepEqual(toolDefinitions(false,taskToolCapabilities(child)).map(tool=>tool.name),['world_read','world_children','world_schema','world_schema_coverage']);
 assert.throws(()=>reduce(project,{type:'taskDone',taskId:'root',attempt:'attempt'}),/delegated/);
 assert.throws(()=>reduce(project,{type:'resolveDelegation',taskId:'root',attempt:'attempt',childTaskId:child.id}),/settled/);
 project=reduce(project,{type:'taskRunning',taskId:child.id,attempt:child.attempt});
 for(const [name,args] of [['world_edit',{action:'replace',path:['value'],source:'2'}],['world_read',{path:['private']}],['propose_work_order',{objective:'Bad',requirements:[],allowedPaths:[['value']]}],['delegate_review',{objective:'Nested',paths:[['value']]}]] as const){
  project=call(project,'bad-'+name,name,args,child.id);assert.equal(project.tasks[0].toolJournal!.at(-1)!.state,'rejected');
 }
 project=call(project,'read','world_read',{path:['value']},child.id);assert.equal(project.tasks[0].toolJournal!.at(-1)!.result.source,'1');
 project=reduce(project,{type:'taskDone',taskId:child.id,attempt:child.attempt,text:'Advisory finding'});
 project=reduce(project,{type:'resolveDelegation',taskId:'root',attempt:'attempt',childTaskId:child.id});
 const result=root(project).toolJournal![0].result;assert.equal(result.summary,'Advisory finding');assert.equal(result.official,false);assert.equal(result.readOnly,true);
 project=call(project,'delegate','delegate_review',{paths:[['value']],objective:'Review value'});assert.equal(project.tasks.filter(task=>task.parentTaskId==='root').length,1);
 assert.equal(project.activeSource,source);assert.equal(project.chat.length,0);
});

test('delegation scope, permission and child count cannot be widened by agent arguments',()=>{
 let project=call(running({allowDelegation:false}),'no','delegate_review',{objective:'Review',paths:[['value']]});assert.equal(root(project).toolJournal![0].state,'rejected');
 project=call(running(),'scope','delegate_review',{objective:'Review',paths:[['private']]});assert.equal(root(project).toolJournal![0].state,'rejected');
 project=running();for(let index=0;index<3;index++)project=call(project,'child-'+index,'delegate_review',{objective:'Review',paths:[['value']]});
 assert.equal(project.tasks.filter(task=>task.parentTaskId==='root').length,2);assert.equal(root(project).toolJournal!.at(-1)!.state,'rejected');
 project=resume(interrupt(project));project=reduce(project,{type:'taskRunning',taskId:'root',attempt:'continued'});
 project=call(project,'after-resume','delegate_review',{objective:'Review again',paths:[['value']]});
 assert.equal(project.tasks.filter(task=>task.parentTaskId==='root').length,2);assert.match(root(project).toolJournal!.at(-1)!.result.error,/two-child/);
});

test('parent stop cascades to children and rejects late tools and pending receipts',()=>{
 let project=call(running(),'delegate','delegate_review',{objective:'Review',paths:[['value']]});const child=project.tasks[0];
 project=reduce(project,{type:'taskRunning',taskId:child.id,attempt:child.attempt});
 project=reduce(project,{type:'taskStop',taskId:'root',attempt:'attempt',state:'CANCELED'});
 assert.equal(project.tasks[0].state,'CANCELED');assert.equal(root(project).toolJournal![0].state,'rejected');
 assert.throws(()=>call(project,'late','world_read',{path:['value']},child.id));assert.throws(()=>resume(project));
});

test('host interruption settles pending reviews without replaying child effects on continuation',()=>{
 const interrupted=interrupt(call(running(),'delegate','delegate_review',{objective:'Review',paths:[['value']]}));
 assert.equal(root(interrupted).toolJournal![0].state,'rejected');assert.equal(interrupted.tasks[0].state,'INTERRUPTED');
 const continued=resume(interrupted);assert.equal(root(continued).state,'PREPARED');assert.equal(continued.tasks[0].state,'INTERRUPTED');assert.equal(continued.tasks.length,2);
});

test('parent and child tool calls consume one lifetime budget across resumption',()=>{
 let project=running();for(let index=0;index<toolJournalLimits.calls-2;index++)project=call(project,'read-'+index,'world_read',{path:['value']});
 project=call(project,'delegate','delegate_review',{objective:'Review',paths:[['value']]});const child=project.tasks[0];
 project=reduce(project,{type:'taskRunning',taskId:child.id,attempt:child.attempt});project=call(project,'child-read','world_read',{path:['value']},child.id);
 assert.equal(groupJournal(project,root(project)).length,toolJournalLimits.calls);assert.throws(()=>call(project,'overflow','world_read',{path:['value']},child.id),/budget/);
 assert.match(resumeIssue(interrupt(project),root(interrupt(project)),'desktop',hash),/budget/);
});
