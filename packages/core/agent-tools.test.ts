import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toolDefinitions,worldTools,validateToolArguments,toolJournalLimits,completionEvidence} from './agent-tools';
import {create,reduce,hash,nativeRequest,type Project} from './project';
import {agentSystem} from './providers';

const references=[{section:'heroesVersion',schema:{_type:'literal',value:37}},{section:'value',schema:'number'}];
const source='{"heroesVersion":37,"value":1,"other":"preserve","exact":9007199254740993}';
function running(kind='work',mode='proposal-only'){
 let project=create('p','Harness',source,1);
 project=reduce(project,{type:'workOrder',order:{objective:'Change value',requirements:[],allowedPaths:[['value']]}});
 project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind,prompt:'Inspect',localEditMode:mode});
 return reduce(project,{type:'taskRunning',taskId:'task',attempt:'attempt'});
}
function call(project:Project,id:string,name:string,args:any,attempt='attempt'){
 return reduce(project,{type:'taskTool',taskId:'task',attempt,callId:id,name,args,references,now:2});
}
const receipt=(project:Project)=>project.tasks[0].toolJournal!.at(-1)!;

test('agent guidance distinguishes local evidence from official validation and budget bypasses',()=>{
 for(const work of [true,false]){
  const prompt=agentSystem(work);
  for(const name of ['world_schema_coverage','world_reference_impact','world_diff','world_readiness'])assert.ok(prompt.includes(name));
  assert.match(prompt,/none establishes official acceptance or gameplay compatibility/);
  assert.match(prompt,/do not retry with new IDs to bypass it/);
 }
 assert.match(agentSystem(true),/host independently checks completion/);
});

test('one registry advertises role-specific read, stage and proposal tools',()=>{
 const plan=toolDefinitions(false),work=toolDefinitions(true);
 assert.equal(new Set(worldTools.map(tool=>tool.name)).size,worldTools.length);
 assert.ok(plan.some(tool=>tool.name==='world_reference_impact'));assert.ok(work.some(tool=>tool.name==='world_readiness'));
 assert.ok(!plan.some(tool=>tool.name==='world_edit'));assert.ok(!work.some(tool=>tool.name==='propose_artwork'));
 assert.throws(()=>validateToolArguments('plan','world_edit',{action:'replace',path:[],source:'{}'}),/unavailable/);
});

test('runtime schemas reject malformed paths, extra fields, invalid actions and missing conditional arguments',()=>{
 for(const args of [{action:'oops',path:['value'],source:'2'},{action:'replace',path:[-1],source:'2'},{action:'replace',path:[1.1],source:'2'},{action:'replace',path:['value'],source:2},{action:'replace',path:['value'],source:'2',type:'taskDone'},{action:'insert',path:[],source:'2'},{action:'remove',path:['value'],source:'2'}])assert.throws(()=>validateToolArguments('work','world_edit',args));
 assert.throws(()=>validateToolArguments('work','world_reference_impact',{path:[],limit:101}));
 assert.throws(()=>validateToolArguments('plan','world_read',{path:Array(129).fill('x')}));
});

test('staged edit and source-bound receipt are one immutable state transition',()=>{
 const before=running(),after=call(before,'edit','world_edit',{action:'replace',path:['value'],source:'2'});
 assert.equal(before.tasks[0].toolJournal,undefined);assert.equal(before.tasks[0].stagedSource,source);
 assert.equal(after.activeSource,source);assert.equal(after.tasks[0].stagedSource,source.replace('"value":1','"value":2'));
 assert.equal(receipt(after).state,'succeeded');assert.equal(receipt(after).beforeHash,hash(source));assert.equal(receipt(after).afterHash,hash(after.tasks[0].stagedSource));
 assert.ok(!JSON.stringify(receipt(after)).includes('"args"'));
});

test('receipts replay duplicate insert calls exactly once, including after serialization',()=>{
 let project=running();project.tasks[0].workOrder.allowedPaths=[[]];
 project=call(project,'insert','world_edit',{action:'insert',path:[],key:'added',source:'1.000'});
 const restored=JSON.parse(JSON.stringify(project));
 const replay=call(restored,'insert','world_edit',{source:'1.000',key:'added',path:[],action:'insert'});
 assert.equal(replay.tasks[0].stagedSource,project.tasks[0].stagedSource);assert.equal(replay.tasks[0].toolJournal!.length,1);
 assert.throws(()=>call(replay,'insert','world_edit',{action:'insert',path:[],key:'different',source:'2'}),/reused/);
});

test('planning proposals replay without duplicating side effects',()=>{
 let project=call(running('plan'),'proposal','propose_work_order',{objective:'Change value',requirements:[],allowedPaths:[['value']]});
 const id=receipt(project).result.proposalId;project=call(project,'proposal','propose_work_order',{requirements:[],allowedPaths:[['value']],objective:'Change value'});
 assert.equal(project.workOrderProposals!.length,1);assert.equal(receipt(project).result.proposalId,id);assert.equal(project.activeSource,source);
});

test('role, scope, protected-field and JSON failures leave staged source unchanged and retain rejected evidence',()=>{
 for(const [project,name,args] of [[running('plan'),'world_edit',{action:'replace',path:['value'],source:'2'}],[running(),'world_edit',{action:'replace',path:['other'],source:'"bad"'}],[running(),'world_edit',{action:'replace',path:['value'],source:'not JSON'}],[running(),'shell',{command:'anything'}]] as const){
  const after=call(project,'bad',name,args);assert.equal(receipt(after).state,'rejected');assert.equal(after.tasks[0].stagedSource,source);assert.equal(project.tasks[0].toolJournal,undefined);
 }
 let project=running();project.tasks[0].workOrder.allowedPaths=[[]];project=call(project,'version','world_edit',{action:'replace',path:['heroesVersion'],source:'38'});assert.equal(receipt(project).state,'rejected');
});

test('late, missing-attempt, stale-attempt and canceled tools cannot create receipts',()=>{
 for(const attempt of ['','stale'])assert.throws(()=>call(running(),'read','world_read',{path:[]},attempt));
 const stopped=reduce(running(),{type:'taskStop',taskId:'task',attempt:'attempt',state:'CANCELED'});
 assert.throws(()=>call(stopped,'read','world_read',{path:[]}));assert.equal(stopped.tasks[0].toolJournal,undefined);
});

test('read tools expose staged diff, advisory references, schema coverage and local readiness only',()=>{
 let project=call(running(),'edit','world_edit',{action:'replace',path:['value'],source:'2'});
 project=call(project,'diff','world_diff',{});assert.equal(receipt(project).result.total,1);
 project=call(project,'coverage','world_schema_coverage',{});assert.equal(receipt(project).result.coverage,'matched');assert.equal(receipt(project).result.official,false);
 project=call(project,'impact','world_reference_impact',{path:['value']});assert.equal(receipt(project).result.total,0);
 project=call(project,'readiness','world_readiness',{});assert.ok(Array.isArray(receipt(project).result));assert.equal(project.remote.operations.length,0);
});

test('automatic application requires host-calculated matching-schema evidence',()=>{
 let project=call(running('work','automatic'),'edit','world_edit',{action:'replace',path:['value'],source:'"invalid"'});
 let completed=reduce(project,{type:'taskDone',taskId:'task',attempt:'attempt',references});
 assert.equal(completed.activeSource,source);assert.equal(completed.tasks[0].state,'PROPOSAL_READY');assert.equal(completed.tasks[0].completionEvidence!.state,'blocked');
 project=call(running('work','automatic'),'edit','world_edit',{action:'replace',path:['value'],source:'2'});
 completed=reduce(project,{type:'taskDone',taskId:'task',attempt:'attempt',references:[]});assert.equal(completed.tasks[0].completionEvidence!.state,'review');assert.equal(completed.activeSource,source);
 completed=reduce(project,{type:'taskDone',taskId:'task',attempt:'attempt',references});assert.equal(completed.tasks[0].state,'APPLIED');assert.equal(completed.tasks[0].completionEvidence!.sourceHash,hash(completed.activeSource));assert.equal(completed.tasks[0].completionEvidence!.official,false);
 assert.equal(completed.tasks[0].completionEvidence!.schemaHash,hash(JSON.stringify(references)));
});

test('completion independently catches out-of-scope changes and corrupt task-start snapshots',()=>{
 const task=running().tasks[0];task.stagedSource=source.replace('preserve','outside');
 assert.equal(completionEvidence(task,references,hash,2).state,'blocked');task.baseHash='wrong';assert.equal(completionEvidence(task,references,hash,2).state,'blocked');
 task.stagedSource='{';assert.equal(completionEvidence(task,references,hash,2).state,'blocked');
});

test('call and result budgets fail closed without silently evicting replay protection',()=>{
 let project=running();const large='x'.repeat(100001);project.tasks[0].stagedSource='{"value":"'+large+'"}';
 project=call(project,'large','world_read',{path:['value']});assert.equal(receipt(project).state,'rejected');
 project=running();for(let index=0;index<toolJournalLimits.calls;index++)project=call(project,String(index),'world_read',{path:['value']});
 assert.throws(()=>call(project,'overflow','world_read',{path:['value']}),/budget/);
 assert.equal(call(project,'0','world_read',{path:['value']}).tasks[0].toolJournal!.length,toolJournalLimits.calls);
});

test('serialized result and cumulative journal budgets reject without staging effects',()=>{
 let project=running();
 project.tasks[0].stagedSource=JSON.stringify({value:'\\'.repeat(49000)});
 project=call(project,'oversize','world_read',{path:['value']});
 assert.equal(receipt(project).state,'rejected');assert.match(receipt(project).result.error,/journal budget/);
 project=running();project.tasks[0].stagedSource=JSON.stringify({value:'x'.repeat(99000)});
 for(let index=0;index<6;index++)project=call(project,'read-'+index,'world_read',{path:['value']});
 assert.equal(receipt(project).state,'rejected');assert.ok(JSON.stringify(project.tasks[0].toolJournal).length<=toolJournalLimits.totalCharacters);
 const staged=project.tasks[0].stagedSource;
 project.tasks[0].toolJournal![0].result={padding:'x'.repeat(toolJournalLimits.totalCharacters)};
 assert.throws(()=>call(project,'edit','world_edit',{action:'replace',path:['value'],source:'2'}),/budget/);
 assert.equal(project.tasks[0].stagedSource,staged);
});

test('old detailed journals expire by policy but completion evidence and summaries remain',()=>{
 let project=call(running(),'read','world_read',{path:['value']});project=reduce(project,{type:'taskDone',taskId:'task',attempt:'attempt',references});
 for(let index=0;index<toolJournalLimits.retainedTasks;index++){
  project=reduce(project,{type:'prepareTask',id:'plan-'+index,attempt:'a',kind:'plan',prompt:'Inspect'});project=reduce(project,{type:'taskRunning',taskId:'plan-'+index,attempt:'a'});project=reduce(project,{type:'taskDone',taskId:'plan-'+index,attempt:'a'});
 }
 const old=project.tasks.at(-1)!;assert.equal(old.toolJournal,undefined);assert.deepEqual(old.toolSummary,{calls:1,rejected:0});assert.ok(old.completionEvidence);
});

test('native bridge exposes the same journaled tool transition',()=>{
 const project=running();const command={type:'taskTool',taskId:'task',attempt:'attempt',callId:'read',name:'world_read',args:{path:['value']},references,now:2};
 const native=JSON.parse(nativeRequest(JSON.stringify({operation:'reduce',project,command})));
 assert.deepEqual(native,JSON.parse(JSON.stringify(reduce(project,command))));
});
