import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash,localEditMode,type Project} from './project';

const source='{"title":"Before","exact":9007199254740993,"fraction":1.000,"other":"keep"}';
function running(mode?:string){
 let project=create('p','Local edit fixture',source,1);
 project=reduce(project,{type:'workOrder',baseHash:hash(source),order:{reviewedScope:true,objective:'Change title',requirements:[],allowedPaths:[['title']]}});
 project=reduce(project,{type:'prepareTask',id:'work',attempt:'attempt',kind:'work',...(mode?{localEditMode:mode}:{})});
 project=reduce(project,{type:'taskRunning',taskId:'work',attempt:'attempt'});
 return reduce(project,{type:'taskEdit',taskId:'work',attempt:'attempt',action:'replace',path:['title'],source:'"After"'});
}
const complete=(project:Project)=>reduce(project,{type:'taskDone',taskId:'work',attempt:'attempt',text:'Updated title',beforeCheckpointId:'before',afterCheckpointId:'after'});
function scopedWork(source:string,path:(string|number)[]){
 let project=create('p','Validated work',source,1);
 project=reduce(project,{type:'workOrder',baseHash:hash(source),order:{reviewedScope:true,objective:'Update authored content',requirements:[],allowedPaths:[path]}});
 project=reduce(project,{type:'prepareTask',id:'work',attempt:'attempt',kind:'work',localEditMode:'automatic'});
 return reduce(project,{type:'taskRunning',taskId:'work',attempt:'attempt'});
}
test('schema-invalid staged combat settings remain an exact proposal instead of automatically applying',()=>{
 const source='{"shortId":"protected","initialGameState":{"worldBackground":"Before","combatSettings":{"minCombatXP":1,"baseCombatXP":2,"abilityCooldown":3,"abilityBonus":4,"npcDailyHealingAmount":5,"damageTypes":[],"damageTypePresentation":{}},"exact":9007199254740993,"fraction":1.000}}';
 const path=['initialGameState','combatSettings'];
 const pending=reduce(scopedWork(source,path),{type:'taskEdit',taskId:'work',attempt:'attempt',action:'replace',path,source:'"unsafe"'});
 const project=complete(pending);
 assert.equal(project.activeSource,source);assert.equal(project.sourceRevision,0);assert.equal(project.tasks[0].state,'PROPOSAL_READY');
 assert.match(project.tasks[0].localApplyBlockedReason!,/Local validation.*combatSettings.*Expected an object/);
 assert.equal(project.candidates[0].source,pending.tasks[0].stagedSource);assert.match(project.candidates[0].source,/9007199254740993,"fraction":1\.000/);
 assert.equal(project.candidates[0].baseHash,hash(source));assert.equal(project.tasks[0].baseSource,'');assert.equal(project.tasks[0].stagedSource,'');
 const background=['initialGameState','worldBackground'];
 const valid=complete(reduce(scopedWork(source,background),{type:'taskEdit',taskId:'work',attempt:'attempt',path:background,source:'"After"'}));
 assert.equal(valid.tasks[0].state,'APPLIED');assert.equal(valid.activeSource,source.replace('Before','After'));assert.equal(valid.candidates.length,0);
});
test('pre-existing imported validation errors also block auto-apply until manually reviewed or repaired',()=>{
 const source='{"initialGameState":{"worldBackground":"Before","combatSettings":"imported error","exact":9007199254740993,"fraction":1.000}}';
 const path=['initialGameState','worldBackground'];
 const project=complete(reduce(scopedWork(source,path),{type:'taskEdit',taskId:'work',attempt:'attempt',path,source:'"After"'}));
 assert.equal(project.activeSource,source);assert.equal(project.tasks[0].state,'PROPOSAL_READY');assert.match(project.tasks[0].localApplyBlockedReason!,/pre-existing imported errors/);
 assert.equal(reduce(project,{type:'accept',id:'work'}).activeSource,source.replace('Before','After'));
 const repairPath=['initialGameState','combatSettings'];
 const repaired=complete(reduce(scopedWork(source,repairPath),{type:'taskEdit',taskId:'work',attempt:'attempt',action:'remove',path:repairPath}));
 assert.equal(repaired.tasks[0].state,'APPLIED');
});
test('legacy running automatic tasks cannot bypass approval by completing already staged edits',()=>{
 const pending=running('automatic');delete pending.tasks[0].workOrder.reviewedScope;
 const project=complete(JSON.parse(JSON.stringify(pending)));
 assert.equal(project.activeSource,source);assert.equal(project.tasks[0].state,'PROPOSAL_READY');assert.equal(project.candidates.length,1);
 assert.match(project.tasks[0].localApplyBlockedReason!,/explicitly approve/);
});
test('automatic local apply updates only completed work and leaves remote state untouched',()=>{
 const pending=running('automatic');assert.equal(pending.activeSource,source);
 const project=complete(pending);
 assert.equal(project.activeSource,source.replace('Before','After'));assert.equal(project.tasks[0].state,'APPLIED');
 assert.equal(project.candidates.length,0);assert.equal(project.sourceRevision,1);assert.deepEqual(project.remote,pending.remote);
 assert.equal(project.tasks[0].baseSource,'');assert.equal(project.tasks[0].stagedSource,'');
});
test('proposal-only and legacy tasks do not apply on completion',()=>{
 for(const mode of ['proposal-only',undefined]){
  const project=complete(running(mode));assert.equal(project.activeSource,source);assert.equal(project.tasks[0].state,'PROPOSAL_READY');assert.equal(project.candidates.length,1);
 }
 assert.equal(localEditMode(),'automatic');assert.equal(localEditMode('proposal-only'),'proposal-only');assert.throws(()=>localEditMode('never-review'));
});
test('drafts and concurrent local changes preserve proposals rather than overwriting work',()=>{
 let pending=running('automatic');pending=reduce(pending,{type:'draft',path:['other'],text:'"Draft"',baseHash:hash(source)});
 let project=complete(pending);assert.equal(project.activeSource,source);assert.equal(project.draft!.text,'"Draft"');assert.match(project.tasks[0].localApplyBlockedReason!,/draft/);assert.equal(project.candidates.length,1);
 pending=reduce(running('automatic'),{type:'edit',path:['other'],source:'"Newer"',baseHash:hash(source)});
 project=complete(pending);assert.equal(project.activeSource,pending.activeSource);assert.match(project.tasks[0].localApplyBlockedReason!,/changed/);assert.equal(project.candidates[0].baseHash,hash(source));
 pending=running('automatic');pending.tasks[0].editorContext={screen:'characters',label:'NPCs',focusPaths:[],excerpts:[],hasUnappliedEdits:true,selectionMissing:false};
 project=complete(pending);assert.equal(project.activeSource,source);assert.match(project.tasks[0].localApplyBlockedReason!,/unapplied form/);assert.equal(project.candidates.length,1);
});
test('failed, canceled, interrupted, no-op and read-only planning cannot auto-apply',()=>{
 for(const state of ['FAILED','CANCELED','INTERRUPTED']){
  let project=running('automatic');project=reduce(project,{type:'taskStop',taskId:'work',attempt:'attempt',state});
  assert.throws(()=>complete(project));assert.equal(project.activeSource,source);
 }
 let project=running('automatic');project=reduce(project,{type:'taskEdit',taskId:'work',attempt:'attempt',action:'replace',path:['title'],source:'"Before"'});project=complete(project);
 assert.equal(project.tasks[0].state,'COMPLETED');assert.equal(project.sourceRevision,0);assert.equal(project.candidates.length,0);
 project=create('p','Planner',source,1);project=reduce(project,{type:'prepareTask',id:'work',attempt:'attempt',kind:'plan',prompt:'Discuss this',localEditMode:'automatic'});project=reduce(project,{type:'taskRunning',taskId:'work',attempt:'attempt'});project=complete(project);
 assert.equal(project.activeSource,source);assert.equal(project.tasks[0].state,'COMPLETED');assert.equal(project.candidates.length,0);
});
test('automatic apply retains linked-note receipts and checkpoint identities',()=>{
 let project=running('automatic');project.tasks[0].workOrder={...project.tasks[0].workOrder,sourceProposalId:'suggestion'};project.tasks[0].sourceNoteIds=['note'];
 project=complete(project);const receipt=project.noteChanges![0];assert.equal(receipt.beforeHash,hash(source));assert.equal(receipt.afterHash,hash(project.activeSource));assert.equal(receipt.beforeCheckpointId,'before');assert.equal(receipt.afterCheckpointId,'after');assert.deepEqual(receipt.noteIds,['note']);
});
test('completed automatic work cannot apply twice or change its frozen edit mode',()=>{
 const completed=complete(running('automatic'));
 assert.throws(()=>complete(completed),/no longer running/);
 assert.equal(completed.sourceRevision,1);assert.equal(completed.candidates.length,0);
 assert.equal(completed.tasks[0].localEditMode,'automatic');
 const proposal=complete(running('proposal-only'));
 assert.equal(proposal.activeSource,source);assert.equal(proposal.tasks[0].state,'PROPOSAL_READY');
 assert.throws(()=>complete(proposal),/no longer running/);
 assert.equal(proposal.candidates.length,1);
});
