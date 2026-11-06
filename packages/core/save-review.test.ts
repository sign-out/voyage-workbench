import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash,remotePayload} from './project';
import {read,exportWorldSource} from './document';
import {voyageSaveFeedback} from './voyage';

const source='{"shortId":"WORLD","title":"Local","initialGameState":{"heroesVersion":37,"compatibilityRevision":16,"unassignedAreas":{},"worldVoices":{},"exact":9007199254740993,"parties":{"":{"quests":{},"questTriggers":{}}}}}';
const remote='{"shortId":"WORLD","title":"Local","initialGameState":{"heroesVersion":37,"compatibilityRevision":16,"characterCreationMusic":"fantasy","exact":9007199254740993,"parties":{"":{"quests":{},"questTriggers":{"__generated_quest_progress__/Example":{"effects":[{"type":"quest-progress","questId":"Example"}]}}}}}}';
function pending(initial=source){
 let project=create('project','World',initial,1);
 project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"old"',envelopeSource:initial});
 project=reduce(project,{type:'savePrepare',id:'save',baseHash:hash(initial),payload:remotePayload(initial)});
 return reduce(project,{type:'saveState',id:'save',state:'SEND_ATTEMPTED'});
}
test('verified additive read-backs are adopted automatically but mixed, stale and identity/version changes are never approved silently',()=>{
 const added=source.replace('"questTriggers":{}','"questTriggers":{"__generated_quest_progress__/New":{"value":9007199254740993}}');
 const command={type:'saveAdditions',operationId:'save',baseHash:hash(source),payloadHash:hash(remotePayload(source)),source:added,etag:'"added"',environment:'alpha',worldId:'WORLD'};
 const project=reduce(pending(),command);assert.equal(read(project.activeSource,['initialGameState','parties','','questTriggers','__generated_quest_progress__/New','value']),'9007199254740993');assert.equal(project.remote.operations[0].state,'ACCEPTED');assert.equal(project.remote.operations[0].automaticAdditions.total,1);assert.equal(project.remote.operations[0].payload,remotePayload(source));assert.equal(project.remote.baselineHash,hash(project.activeSource));assert.equal(project.remote.etag,'"added"');assert.equal(project.candidates.length,0);assert.match(voyageSaveFeedback(project.remote.operations[0])!.title,/server additions adopted/);
 const restored=JSON.parse(JSON.stringify(project));assert.equal(restored.remote.operations[0].automaticAdditions.total,1);
 const withCopy=reduce(pending(),{...command,source:added.replace('"title":"Local",','"title":"Local","description":"Server-added public copy",')});assert.equal(read(withCopy.activeSource,['description']),'"Server-added public copy"');assert.equal(withCopy.remote.operations[0].automaticAdditions.total,2);
 const unversioned=source.replace('"compatibilityRevision":16,',''),versioned=reduce(pending(unversioned),{...command,baseHash:hash(unversioned),payloadHash:hash(remotePayload(unversioned))});assert.equal(read(versioned.activeSource,['initialGameState','compatibilityRevision']),'16');assert.equal(versioned.remote.operations[0].automaticAdditions.total,2);
 const arraySource=source.replace('"exact":9007199254740993','"entries":[{"name":"First"},{"name":"Second"}],"exact":9007199254740993'),arrayAdded=arraySource.replace('[{"name":"First"},{"name":"Second"}]','[{"name":"First","detail":"Filled by server"},{"name":"Second"},{"name":"Third"}]'),arrayCommand={...command,baseHash:hash(arraySource),payloadHash:hash(remotePayload(arraySource)),source:arrayAdded};
 const arrays=reduce(pending(arraySource),arrayCommand);assert.equal(arrays.remote.operations[0].automaticAdditions.total,2);assert.equal(read(arrays.activeSource,['initialGameState','entries',2,'name']),'"Third"');
 for(const changed of ['[{"name":"Second"},{"name":"First"}]','[{"name":"First"}]'])assert.throws(()=>reduce(pending(arraySource),{...arrayCommand,source:arraySource.replace('[{"name":"First"},{"name":"Second"}]',changed)}));
 for(const changed of [added.replace('"title":"Local"','"title":"Changed"'),added.replace('"compatibilityRevision":16','"compatibilityRevision":17'),added.replace('"WORLD"','"OTHER"'),added.replace('"worldVoices":{},','')])assert.throws(()=>reduce(pending(),{...command,source:changed}));
 const edited=reduce(pending(),{type:'edit',path:['title'],source:'"Newer local edit"',baseHash:hash(source)});assert.throws(()=>reduce(edited,{...command,baseHash:hash(edited.activeSource)}),/unchanged submitted world/);assert.equal(read(edited.activeSource,['title']),'"Newer local edit"');assert.equal(pending().activeSource,source);
});
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
