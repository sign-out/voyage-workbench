import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash,remotePayload} from './project';
import {noteQueue,readBuilderNotes,reconcileNotes,type BuilderNote} from './builder-notes';
import {toolDefinitions} from './providers';
const source='{"shortId":"fixed","initialGameState":{"combatSettings":{"damage":9007199254740993},"unknown":{"custom":null},"items":[{"id":"a","value":1},{"id":"b","value":2}]}}';
const initial=()=>create('p','Notes',source,1);
function add(project=initial(),id='n',path:(string|number)[]=['initialGameState','combatSettings'],planning=true,text='Deepen combat with a fatigue system'){
 return reduce(project,{type:'builderNote',baseHash:hash(project.activeSource),note:{id,path,text,planning},now:2});
}
test('any existing entry, system, scalar, array item or package entry supports a sidecar note',()=>{
 let project=initial();const paths=[[],['shortId'],['initialGameState','combatSettings'],['initialGameState','combatSettings','damage'],['initialGameState','unknown','custom'],['initialGameState','items'],['initialGameState','items',0]];
 paths.forEach((path,index)=>project=add(project,'n'+index,path));
 assert.equal(project.builderNotes?.length,paths.length);assert.equal(project.activeSource,source);assert.equal(project.sourceRevision,0);
 assert(!remotePayload(project.activeSource).includes('Deepen combat'));assert.equal(initial().builderNotes,undefined);
});
test('note edits and flags require the current note revision and do not edit world source',()=>{
 const before=add(),note=before.builderNotes![0];
 const after=reduce(before,{type:'builderNote',baseHash:hash(source),expectedRevision:1,note:{...note,planning:false,text:'Rewrite the background'}});
 assert.equal(after.builderNotes![0].revision,2);assert.equal(after.builderNotes![0].planning,false);assert.equal(before.builderNotes![0].text,note.text);
 assert.throws(()=>reduce(after,{type:'builderNote',baseHash:hash(source),expectedRevision:1,note}),/changed/);
 assert.throws(()=>reduce(after,{type:'deleteBuilderNote',id:'n',expectedRevision:1}),/changed/);
 assert.equal(reduce(after,{type:'deleteBuilderNote',id:'n',expectedRevision:2}).builderNotes?.length,0);
});
test('bad attachments and stale sources are rejected without coercion',()=>{
 for(const path of [['missing'],['initialGameState','items',-1],['initialGameState',1.5],[true]])assert.throws(()=>add(initial(),'n',path as any));
 assert.throws(()=>reduce(add(),{type:'builderNote',baseHash:'old',note:{id:'bad',path:[],text:'text',planning:true}}),/changed/);
 assert.throws(()=>add(initial(),'n',[],true,' '));
});
test('deleting an attached entry preserves an unresolved note for explicit reattachment',()=>{
 let project=add(initial(),'n',['initialGameState','unknown','custom']);
 project=reduce(project,{type:'remove',baseHash:hash(source),path:['initialGameState','unknown']});
 assert(project.builderNotes![0].unresolved);assert.equal(project.builderNotes![0].text,'Deepen combat with a fatigue system');
 const old=project.builderNotes![0];
 assert.throws(()=>reduce(project,{type:'builderNote',baseHash:hash(project.activeSource),expectedRevision:old.revision,note:{...old,path:[]}}),/explicit reattachment/);
 project=reduce(project,{type:'builderNote',baseHash:hash(project.activeSource),expectedRevision:old.revision,reattach:true,note:{...old,path:[]}});
 assert.equal(project.builderNotes![0].unresolved,undefined);assert.deepEqual(project.builderNotes![0].originalPath,['initialGameState','unknown','custom']);
});
test('array reorder follows only unambiguous exact identity and duplicate matches are unresolved',()=>{
 const project=add(initial(),'n',['initialGameState','items',0,'value']);
 const reordered=source.replace('[{"id":"a","value":1},{"id":"b","value":2}]','[{"id":"b","value":2},{"id":"a","value":1}]');
 const moved=reconcileNotes(project.builderNotes!,source,reordered);assert.deepEqual(moved[0].path,['initialGameState','items',1,'value']);assert.equal(moved[0].unresolved,undefined);
 const ambiguous=source.replace('[{"id":"a","value":1},{"id":"b","value":2}]','[{"id":"a","value":1},{"id":"a","value":1}]');assert(reconcileNotes(project.builderNotes!,source,ambiguous)[0].unresolved);
 const replacement=source.replace('"id":"a"','"id":"different"');assert(reconcileNotes(project.builderNotes!,source,replacement)[0].unresolved);
});
test('known descendant edits retain array attachment; deleting an item never rebinds to the next',()=>{
 let project=add(initial(),'n',['initialGameState','items',0,'value']);
 project=reduce(project,{type:'edit',baseHash:hash(source),path:['initialGameState','items',0,'value'],source:'3'});assert.equal(project.builderNotes![0].unresolved,undefined);
 project=reduce(project,{type:'remove',baseHash:hash(project.activeSource),path:['initialGameState','items',0]});assert(project.builderNotes![0].unresolved);
});
test('notes context is related, paged and never includes unresolved entries',()=>{
 let project=add(initial(),'root',[],false);for(let index=0;index<7;index++)project=add(project,'field'+index,['initialGameState','combatSettings'],false);
 project=add(project,'other',['initialGameState','unknown'],false);
 const notes=project.builderNotes!,page=readBuilderNotes(notes,['initialGameState','combatSettings','damage']);assert.equal(page.total,8);assert.equal(page.notes.length,5);assert.equal(page.nextOffset,5);assert(!page.notes.some(note=>note.id==='other'));
 assert.equal(readBuilderNotes(notes,['initialGameState','combatSettings','damage'],5).nextOffset,null);assert.throws(()=>readBuilderNotes(notes,[],0.5));
});
test('Address project notes freezes all flagged requests, includes unresolved items and never executes work',()=>{
 let project=add();project=add(project,'unflagged',[],false,'Background guidance');project=add(project,'background',['initialGameState','unknown'],true,'Rewrite this character background');
 const before=project;project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',addressNotes:true});
 const task=project.tasks[0];assert.equal(task.noteQueue?.length,2);assert.deepEqual(task.noteQueue?.map(item=>item.noteId),['n','background']);assert.match(task.prompt,/record_note_plan/);assert.match(task.prompt,/Rewrite this character background/);assert.equal(project.activeSource,source);assert.deepEqual(project.workOrder,before.workOrder);
 const modified=reduce(project,{type:'builderNote',baseHash:hash(source),expectedRevision:1,note:{...project.builderNotes![0],text:'Changed'}});assert.equal(modified.tasks[0].noteQueue?.[0].text,'Deepen combat with a fatigue system');
 const restored=JSON.parse(JSON.stringify(project));assert.equal(restored.tasks[0].noteQueue[0].state,'queued');assert.equal(restored.chat.at(-1).text,'Address project notes · 2 flagged notes');
});
test('queue start blocks drafts, empty selections, work stage and oversized context without dropping notes',()=>{
 assert.throws(()=>reduce(initial(),{type:'prepareTask',id:'t',attempt:'a',kind:'plan',addressNotes:true}),/Flag at least/);
 const project=add();const draft=reduce(project,{type:'draft',baseHash:hash(source),path:['initialGameState','combatSettings'],text:'{}'});
 assert.throws(()=>reduce(draft,{type:'prepareTask',id:'t',attempt:'a',kind:'plan',addressNotes:true}),/draft/);
 const work=reduce(project,{type:'workOrder',baseHash:hash(source),order:{reviewedScope:true,objective:'Work',requirements:[],allowedPaths:[],wholeWorld:true}});assert.throws(()=>reduce(work,{type:'prepareTask',id:'t',attempt:'a',kind:'work',addressNotes:true}),/planning task/);
 const large:Array<BuilderNote>=Array.from({length:11},(_,index)=>({id:String(index),path:[],text:'x'.repeat(20000),planning:true,revision:1,created:1,updated:1}));assert.throws(()=>noteQueue(large),/no notes were omitted/);assert.equal(large.length,11);
});
test('planner outcomes are task-scoped, proposal-backed, durable and never clear action flags',()=>{
 let project=reduce(reduce(add(),{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',addressNotes:true}),{type:'taskRunning',taskId:'task',attempt:'attempt'});
 const record={type:'recordNotePlan',taskId:'task',attempt:'attempt',noteId:'n',state:'proposed',explanation:'A scoped Work Order is ready',proposalId:'proposal'};
 assert.throws(()=>reduce(project,record),/existing proposal/);assert.throws(()=>reduce(project,{...record,noteId:'other'}),/not in this task/);
 project=reduce(project,{type:'proposeWorkOrder',taskId:'task',attempt:'attempt',id:'proposal',order:{objective:'Improve combat',requirements:['Preserve existing settings'],allowedPaths:[['initialGameState','combatSettings']]}});
 const previous=project;project=reduce(project,record);assert.equal(previous.tasks[0].noteQueue?.[0].state,'queued');assert.equal(project.tasks[0].noteQueue?.[0].state,'proposed');assert.equal(project.builderNotes![0].planning,true);
 project=reduce(project,{type:'taskDone',taskId:'task',attempt:'attempt',text:'Review the proposal'});assert.equal(project.tasks[0].noteQueue?.[0].proposalId,'proposal');assert.equal(project.tasks[0].builderNotes?.length,0);assert.throws(()=>reduce(project,record),/running planner/);
});
test('interrupted queues preserve unaddressed items and planning-only outcome tools',()=>{
 let project=reduce(reduce(add(),{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',addressNotes:true}),{type:'taskRunning',taskId:'task',attempt:'attempt'});
 assert.throws(()=>reduce(project,{type:'recordNotePlan',taskId:'task',attempt:'old',noteId:'n',state:'blocked',explanation:'Needs more detail'}));
 project=reduce(project,{type:'taskStop',taskId:'task'});assert.equal(project.tasks[0].noteQueue?.[0].state,'queued');assert.equal(project.builderNotes![0].planning,true);
 assert(toolDefinitions(false).some(tool=>tool.name==='record_note_plan'));assert(!toolDefinitions(true).some(tool=>tool.name==='record_note_plan'));assert(toolDefinitions(true).some(tool=>tool.name==='world_notes'));
});
test('addressed notes leave the pending queue, remain explorable, and can be explicitly requeued',()=>{
 let project=reduce(reduce(add(),{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',addressNotes:true}),{type:'taskRunning',taskId:'task',attempt:'attempt'});
 project=reduce(project,{type:'recordNotePlan',taskId:'task',attempt:'attempt',noteId:'n',state:'clarification',explanation:'Which fatigue rules should apply?'});
 assert.equal(project.builderNotes![0].lastPlan?.state,'clarification');assert.throws(()=>noteQueue(project.builderNotes!),/pending/);
 const result=project.tasks[0].noteQueue![0];project=reduce(project,{type:'requeueBuilderNote',id:'n',expectedRevision:1});
 assert.equal(project.builderNotes![0].lastPlan,undefined);assert.equal(noteQueue(project.builderNotes!).length,1);assert.equal(result.state,'clarification');
 assert.throws(()=>reduce(project,{type:'requeueBuilderNote',id:'n',expectedRevision:1}),/changed/);
});
test('late planning feedback never marks an edited note as addressed',()=>{
 let project=reduce(reduce(add(),{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',addressNotes:true}),{type:'taskRunning',taskId:'task',attempt:'attempt'});
 project=reduce(project,{type:'builderNote',baseHash:hash(source),expectedRevision:1,note:{...project.builderNotes![0],text:'A different request'}});
 project=reduce(project,{type:'recordNotePlan',taskId:'task',attempt:'attempt',noteId:'n',state:'blocked',explanation:'Original request needs more detail'});
 assert.equal(project.tasks[0].noteQueue![0].state,'blocked');assert.equal(project.builderNotes![0].lastPlan,undefined);assert.equal(noteQueue(project.builderNotes!).length,1);
});
test('note-linked work carries its provenance into staged and applied changes',()=>{
 let project=reduce(reduce(add(),{type:'prepareTask',id:'plan',attempt:'plan-attempt',kind:'plan',addressNotes:true}),{type:'taskRunning',taskId:'plan',attempt:'plan-attempt'});
 project=reduce(project,{type:'proposeWorkOrder',taskId:'plan',attempt:'plan-attempt',id:'suggestion',order:{objective:'Improve combat',requirements:[],allowedPaths:[['initialGameState','combatSettings']]}});
 project=reduce(project,{type:'recordNotePlan',taskId:'plan',attempt:'plan-attempt',noteId:'n',state:'proposed',explanation:'Ready for author review',proposalId:'suggestion'});
 project=reduce(project,{type:'taskDone',taskId:'plan',attempt:'plan-attempt'});
 project=reduce(project,{type:'workOrder',baseHash:hash(source),order:{...project.workOrderProposals![0].order,reviewedScope:true,sourceProposalId:'suggestion'}});
 project=reduce(reduce(project,{type:'prepareTask',id:'work',attempt:'work-attempt',kind:'work'}),{type:'taskRunning',taskId:'work',attempt:'work-attempt'});
 project=reduce(project,{type:'taskEdit',taskId:'work',attempt:'work-attempt',action:'insert',path:['initialGameState','combatSettings'],key:'fatigue',source:'true'});
 project=reduce(project,{type:'taskDone',taskId:'work',attempt:'work-attempt'});
 assert.deepEqual(project.candidates[0].noteIds,['n']);assert.equal(project.candidates[0].sourceProposalId,'suggestion');assert.equal(project.activeSource,source);
 project=reduce(project,{type:'accept',id:'work',beforeCheckpointId:'before',afterCheckpointId:'after'});
 assert.equal(project.noteChanges?.length,1);assert.equal(project.noteChanges![0].proposalId,'suggestion');assert.deepEqual(project.noteChanges![0].noteIds,['n']);assert.equal(project.noteChanges![0].beforeCheckpointId,'before');assert.equal(project.noteChanges![0].afterHash,hash(project.activeSource));assert.match(project.activeSource,/9007199254740993/);
});
test('pending candidates and task provenance are not silently dropped by count limits',()=>{
 let project=initial();for(let index=0;index<25;index++)project=reduce(project,{type:'stage',id:'candidate-'+index,source,title:'Candidate '+index,kind:'checkpoint'});
 assert.equal(project.candidates.length,25);
 for(let index=0;index<20;index++){project=reduce(project,{type:'prepareTask',kind:'plan',id:'task-'+index,attempt:'attempt-'+index,prompt:'Inspect'});project=reduce(project,{type:'taskRunning',taskId:'task-'+index});project=reduce(project,{type:'taskDone',taskId:'task-'+index});}
 assert.equal(project.tasks.length,20);assert.equal(project.candidates.length,25);
});
