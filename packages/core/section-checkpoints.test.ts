import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash,type Project} from './project';
import {AssistantRecoveryBudget} from './assistant-recovery';
import {toolDefinitions,agentSystem} from './providers';

const source='{"title":"Before","description":"Original","aiInstructions":{},"exact":9007199254740993}';
function prepared(input=source){let project=create('project','World',input,1);project=reduce(project,{type:'workOrder',baseHash:hash(input),order:{reviewedScope:true,objective:'Improve sections',requirements:[],wholeWorld:true,allowedPaths:[]}});project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work',localEditMode:'proposal-only'});return reduce(project,{type:'taskRunning',taskId:'task',attempt:'attempt'});}
const command=(project:Project,type:string,extra:any={})=>reduce(project,{type,taskId:'task',attempt:'attempt',...extra});
const edit=(project:Project,path:(string|number)[],value:string)=>command(project,'taskEdit',{path,action:'replace',source:value});
const checkpoint=(project:Project,paths:(string|number)[][],extra:any={})=>command(project,'taskSectionCheckpoint',{label:'Completed section',paths,sectionCheckpointId:'checkpoint-'+(project.tasks[0].sectionCheckpoints?.length||0),...extra});

test('section A checkpoints and section B validation failure preserves A and failed draft',()=>{
 let project=prepared();project=edit(project,['title'],'"After"');project=checkpoint(project,[['title']]);
 const baseline=project.tasks[0].stagedSource,receipt=project.tasks[0].sectionCheckpoints![0];
 project=edit(project,['aiInstructions'],'42');const before=JSON.stringify(project);
 assert.throws(()=>checkpoint(project,[['aiInstructions']],{sectionBaseSource:baseline}),/checkpoint 1.*aiInstructions.*New validation errors/);
 assert.equal(JSON.stringify(project),before);assert.equal(project.activeSource,source);assert.equal(project.tasks[0].sectionCheckpoints![0].id,receipt.id);
 project=edit(project,['aiInstructions'],'{"story":{"tone":"Gentle"}}');project=checkpoint(project,[['aiInstructions']],{sectionBaseSource:baseline});
 assert.equal(project.tasks[0].sectionCheckpoints!.length,2);assert.match(project.tasks[0].stagedSource,/9007199254740993/);assert.match(project.tasks[0].stagedSource,/"title":"After"/);
 assert.equal(project.workOrder.approvalBaseHash,hash(source));assert.deepEqual(project.remote.operations,[]);
});

test('dependency groups cover every change and may not broaden approved scope',()=>{
 let project=edit(edit(prepared(),['title'],'"After"'),['description'],'"Better"');
 assert.throws(()=>checkpoint(project,[['title']]),/every changed section/);
 project=checkpoint(project,[['title'],['description']]);assert.equal(project.tasks[0].sectionCheckpoints!.length,1);
 const scoped=prepared();scoped.tasks[0].workOrder={...scoped.tasks[0].workOrder,wholeWorld:false,allowedPaths:[['title']]};
 assert.throws(()=>checkpoint(edit(scoped,['title'],'"After"'),[['description']]),/outside.*scope/);
});

test('duplicate checkpoints are idempotent and stale task/baseline receipts fail closed',()=>{
 let project=checkpoint(edit(prepared(),['title'],'"After"'),[['title']]);
 const first=project.tasks[0].sectionCheckpoints![0];
 assert.throws(()=>checkpoint(project,[['title']],{sectionBaseSource:undefined}),/frozen section checkpoint source/);
 project=checkpoint(project,[['title']],{sectionCheckpointId:'duplicate',sectionBaseSource:project.tasks[0].stagedSource});
 assert.deepEqual(project.tasks[0].sectionCheckpoints,[first]);
 project=edit(project,['description'],'"Better"');
 assert.throws(()=>checkpoint(project,[['description']],{sectionBaseSource:source}),/frozen section checkpoint source/);
 assert.throws(()=>command(project,'taskSectionCheckpoint',{attempt:'stale',paths:[['description']]}),/attempt no longer exists/);
 assert.throws(()=>command(project,'taskSectionCheckpoint',{attempt:undefined,paths:[['description']]}),/attempt no longer exists/);
});

test('pre-existing errors stay separate and one recovery budget spans successful sections',()=>{
 const original=source.replace('"aiInstructions":{}','"aiInstructions":42');
 let project=checkpoint(edit(prepared(original),['title'],'"After"'),[['title']]);
 assert.ok(project.tasks[0].sectionCheckpoints![0].preexistingErrors>0);
 const baseline=project.tasks[0].stagedSource,budget=new AssistantRecoveryBudget({enabled:true,maxAttempts:1});
 project=edit(project,['aiInstructions'],'{"story":{"tone":false}}');
 const failed=()=>checkpoint(project,[['aiInstructions']],{sectionBaseSource:baseline});
 assert.equal((budget.tool(failed,()=>{}) as any).recovery.attempt,1);
 assert.equal(budget.tool(()=>project.tasks[0].sectionCheckpoints![0].sequence,()=>{}),1);
 assert.throws(()=>budget.tool(failed,()=>{}),/exhausted/);
});

test('checkpoint tools are work-only and instructions never authorize remote incremental saves',()=>{
 assert.ok(toolDefinitions(true).some(tool=>tool.name==='world_checkpoint'));
 for(const definitions of [toolDefinitions(false),toolDefinitions(true,true),toolDefinitions(true,false,true)])assert.ok(!definitions.some(tool=>tool.name==='world_checkpoint'));
 assert.match(agentSystem(true),/one section at a time/);assert.match(agentSystem(true),/Never save or publish to Voyage/);
});
test('record-level array scopes checkpoint safely without requiring collection-wide approval',()=>{
 let project=prepared('{"npcs":[{"name":"Alice"},{"name":"Bob"}]}');
 project.tasks[0].workOrder={...project.tasks[0].workOrder,wholeWorld:false,allowedPaths:[['npcs',0]]};
 project=edit(project,['npcs',0,'name'],'"Alicia"');project=checkpoint(project,[['npcs',0]]);
 assert.equal(project.tasks[0].sectionCheckpoints![0].sequence,1);assert.match(project.tasks[0].stagedSource,/Bob/);
 assert.throws(()=>checkpoint(prepared(),[[]]),/individual authored sections/);
});
test('trusted section validation diagnostics remain correctable even when authored labels mention auth',()=>{
 let project=checkpoint(edit(prepared(),['title'],'"After"'),[['title']],{label:'Authentication and network'});
 const baseline=project.tasks[0].stagedSource;project=edit(project,['aiInstructions'],'42');
 const budget=new AssistantRecoveryBudget(),failure=()=>checkpoint(project,[['aiInstructions']],{sectionBaseSource:baseline});
 assert.equal((budget.tool(failure,()=>{}) as any).recovery.attempt,1);
 assert.throws(()=>budget.correctiveOpportunity(new Error('HTTP 401 Section checkpoint failed after the task baseline.')),/HTTP 401/);
});
test('fixed pre-existing validation errors are not reported as still remaining',()=>{
 let project=prepared(source.replace('"aiInstructions":{}','"aiInstructions":42'));
 project=checkpoint(edit(project,['aiInstructions'],'{}'),[['aiInstructions']]);
 assert.equal(project.tasks[0].sectionCheckpoints![0].preexistingErrors,0);
});
