import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash,remotePayload} from './project';
import {read,exportWorldSource} from './document';
import {voyageSaveFeedback} from './voyage';

const source='{"shortId":"WORLD","title":"Local","initialGameState":{"heroesVersion":37,"compatibilityRevision":16,"unassignedAreas":{},"worldVoices":{},"exact":9007199254740993,"parties":{"":{"quests":{},"questTriggers":{}}}}}';
const remote='{"shortId":"WORLD","title":"Local","initialGameState":{"heroesVersion":37,"compatibilityRevision":16,"characterCreationMusic":"fantasy","exact":9007199254740993,"parties":{"":{"quests":{},"questTriggers":{"__generated_quest_progress__/Example":{"effects":[{"type":"quest-progress","questId":"Example"}]}}}}}}';
function pending(){
 let project=create('project','World',source,1);
 project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"old"',envelopeSource:source});
 project=reduce(project,{type:'savePrepare',id:'save',baseHash:hash(source),payload:remotePayload(source)});
 return reduce(project,{type:'saveState',id:'save',state:'SEND_ATTEMPTED'});
}
function review(project=pending(),overrides:any={}){
 return reduce(project,{type:'saveReview',id:'review',operationId:'save',baseHash:hash(project.activeSource),payloadHash:hash(project.remote.operations[0].payload),source:remote,etag:'"new"',environment:'alpha',worldId:'WORLD',...overrides});
}
test('remote normalization stays unresolved until complete explicit snapshot acceptance',()=>{
 const original=pending(),proposal=review(original);
 assert.equal(original.remote.operations[0].state,'SEND_ATTEMPTED');
 assert.equal(proposal.activeSource,source);assert.equal(proposal.remote.etag,'"old"');
 assert.equal(proposal.remote.operations[0].state,'UNKNOWN');assert.equal(proposal.remote.operations[0].comparison.total,4);
 assert.equal(proposal.candidates[0].remoteSave?.operationId,'save');
 const accepted=reduce(proposal,{type:'accept',id:'review'});
 assert.equal(accepted.activeSource,remote);assert.equal(accepted.remote.etag,'"new"');
 assert.equal(accepted.remote.baselineHash,hash(remote));assert.equal(accepted.remote.envelopeSource,remote);
 assert.equal(accepted.remote.operations[0].state,'ACCEPTED');assert.equal(accepted.remote.operations[0].payload,remotePayload(source));
 assert.equal(accepted.remote.operations[0].sourceHash,hash(source));assert.equal(accepted.candidates.length,0);
 assert.match(voyageSaveFeedback(accepted.remote.operations[0])!.detail,/not an exact read-back/);
 assert.equal(proposal.remote.operations[0].state,'UNKNOWN');
});
test('rejecting, partial review and later local edits cannot silently resolve a save',()=>{
 const proposal=review();
 assert.throws(()=>reduce(proposal,{type:'candidateChange',id:'review',candidateHash:hash(remote),path:['initialGameState','worldVoices'],kind:'removed',reject:true}),/complete snapshot/);
 const partial={...proposal,candidates:proposal.candidates.map(candidate=>({...candidate,rejectedChanges:[{path:['initialGameState','worldVoices'],kind:'removed' as const}]}))};
 assert.throws(()=>reduce(partial,{type:'accept',id:'review'}),/complete downloaded snapshot/);
 const rejected=reduce(proposal,{type:'reject',id:'review'});
 assert.equal(rejected.activeSource,source);assert.equal(rejected.remote.operations[0].state,'UNKNOWN');
 const edited=reduce(proposal,{type:'edit',path:['title'],source:'"Newer local edit"',baseHash:hash(source)});
 assert.throws(()=>reduce(edited,{type:'accept',id:'review'}),/world changed/);
});
test('review binds operation, source, target, revision and downloaded identity',()=>{
 for(const changes of [{baseHash:'stale'},{payloadHash:'stale'},{operationId:'other'},{environment:'production'},{worldId:'OTHER'},{etag:''},{source:remote.replace('"WORLD"','"OTHER"')},{source:'{"initialGameState":null}'}])assert.throws(()=>review(pending(),changes));
 const draft=reduce(pending(),{type:'draft',path:['title'],text:'"Draft"',baseHash:hash(source)});
 assert.throws(()=>review(draft),/editor draft/);
 const proposal=review();
 const changed=reduce(proposal,{type:'saveState',id:'save',state:'UNKNOWN',comparison:{matches:false,total:1,paths:[],truncated:false}});
 assert.equal(changed.candidates.length,0);assert.equal(changed.remote.operations[0].readback,undefined);
 const rechecked=review(proposal,{id:'new-review',etag:'"newer"'});
 assert.deepEqual(rechecked.candidates.map(candidate=>candidate.id),['new-review']);
 const forged={...proposal,candidates:proposal.candidates.map(candidate=>({...candidate,source:remote.replace('"Local"','"Forged"')}))};
 assert.throws(()=>reduce(forged,{type:'accept',id:'review'}),/read-back changed/);
});
test('reviewed snapshots align with raw GameState projects and preserve exact numbers',()=>{
 const project=pending();project.activeSource=exportWorldSource(source,'voyage');
 const proposal=review(project),accepted=reduce(proposal,{type:'accept',id:'review'});
 assert.equal(accepted.activeSource,exportWorldSource(remote,'voyage'));
 assert.equal(read(accepted.activeSource,['exact']),'9007199254740993');
 assert.equal(accepted.remote.envelopeSource,remote);
});
test('adopting remote changes preserves unsent local metadata without retaining absent server flags',()=>{
 const project=pending();project.activeSource=project.activeSource.replace('"title":"Local",','"title":"Local","creationNotes":"Private local notes","customLocal":{"number":9007199254740993},"canSafelySave":false,');
 const proposal=review(project),accepted=reduce(proposal,{type:'accept',id:'review'});
 assert.equal(read(accepted.activeSource,['creationNotes']),'"Private local notes"');
 assert.equal(read(accepted.activeSource,['customLocal','number']),'9007199254740993');
 assert.throws(()=>read(accepted.activeSource,['canSafelySave']));
 assert.equal(remotePayload(accepted.activeSource),remotePayload(remote));
});
test('project and Studio-shaped exports are explicit, lossless and never rewrite keys',()=>{
 const state='{ "heroesVersion":37, "compatibilityRevision":16, "exact":9007199254740993, "ratio":1.2300e+42, "notes":{"Broad/Specialist":"Keep / and %2F"}}';
 for(const wrapped of ['{"initialGameState":'+state+',"title":"Metadata"}','{"world":{"initialGameState":'+state+'}}','{"data":{"world":{"initialGameState":'+state+'}}}',state]){
  assert.equal(exportWorldSource(wrapped,'project'),wrapped);assert.equal(exportWorldSource(wrapped,'voyage'),state);
 }
 assert.throws(()=>exportWorldSource('[]','voyage'),/object/);
 assert.throws(()=>exportWorldSource('{}','unsupported' as any),/Choose/);
});
