import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCreationTransfer} from './creation-transfer';
import {creationArtifactSpecs,createWorkspace,creationVisualHash} from './world-creation';
import {create,hash,reduce} from './project';
import {project as fixture,source,perfectReview} from '../../tests/creation-fixture';

function completed(){
 let project=fixture();project.creation!.design.decisions[0].locked=true;project.creation!.maps[0].features[0].locked=true;
 for(const [index,spec] of creationArtifactSpecs(project.creation!,source,hash).entries()){
  project=reduce(project,{type:'creationJobStart',baseHash:hash(source),expectedRevision:project.creation!.revision,id:spec.id,specHash:spec.specHash,attempt:'attempt',routeHash:hash('route')});
  project=reduce(project,{type:'creationJobFinish',id:spec.id,attempt:'attempt',state:'ready',assetId:'asset-'+index,assetHash:hash('pixels')});
 }
 return project;
}
test('creation transfer preserves canon locks, geography and ready artwork but resets permissions, URLs and assessment evidence',()=>{
 const project=completed(),workspace=project.creation!;
 workspace.jobs.forEach(job=>{job.url='https://example.com/upload.png';});
 workspace.visualReview={inputHash:creationVisualHash(workspace,source,hash),report:'Prior inspection',created:1};
 workspace.review={...perfectReview(),inputHash:'old',created:1};
 const restored=prepareCreationTransfer(workspace,source,hash,'fresh-creation');
 assert.equal(restored.id,'fresh-creation');assert.deepEqual(restored.design,workspace.design);assert.deepEqual(restored.maps,workspace.maps);assert.deepEqual(restored.documents,workspace.documents);
 assert.equal(restored.jobs.length,2);assert.ok(restored.jobs.every(job=>!job.url&&!job.routeHash&&job.attempt==='restored'));assert.equal(restored.review,undefined);assert.equal(restored.visualReview,undefined);assert.equal(restored.sourceReads,undefined);
 assert.ok(restored.jobs.every(job=>creationArtifactSpecs(restored,source,hash).some(spec=>spec.id===job.id&&spec.specHash===job.specHash)));
 const result=reduce(create('new-project','Copy',source,1),{type:'restoreCreation',baseHash:hash(source),workspace:restored,creationId:'another-fresh-id'});
 assert.equal(result.remote.worldId,'');assert.equal(result.tasks.length,0);assert.deepEqual(result.workOrder,{objective:'',requirements:[],allowedPaths:[]});assert.match(result.activeSource,/9007199254740993/);
 assert.throws(()=>reduce(result,{type:'restoreCreation',baseHash:hash(source),workspace:restored,creationId:'overwrite'}),/fresh/);
});
test('transfer accepts unfinished workspaces, drops stale jobs and preserves uncertain outcomes without authorizing retries',()=>{
 const workspace=createWorkspace({id:'initial',brief:'Adapt the source',documents:[{id:'source',name:'Source',text:'An island.'}]},hash);
 const restored=prepareCreationTransfer(workspace,source,hash,'new');assert.deepEqual(restored.design,workspace.design);assert.deepEqual(restored.jobs,[]);
 const done=completed().creation!;done.jobs[0].state='running';done.jobs[1].specHash=hash('stale');const jobs=prepareCreationTransfer(done,source,hash,'new').jobs;assert.equal(jobs.length,1);assert.equal(jobs[0].state,'uncertain');assert.match(jobs[0].error!,/explicitly authorizing a retry/);assert.equal(jobs[0].routeHash,undefined);
});
test('transfer rejects corrupted research, invalid locks/geometry, duplicate jobs and unsafe IDs',()=>{
 const original=completed().creation!;
 const research=structuredClone(original);research.documents[0].text+='changed';assert.throws(()=>prepareCreationTransfer(research,source,hash,'new'),/hash/);
 const geometry=structuredClone(original);geometry.maps[0].land='url(evil)';assert.throws(()=>prepareCreationTransfer(geometry,source,hash,'new'),/palette/);
 const duplicate=structuredClone(original);duplicate.jobs.push({...duplicate.jobs[0]});assert.throws(()=>prepareCreationTransfer(duplicate,source,hash,'new'),/unique/);
 assert.throws(()=>prepareCreationTransfer(original,source,hash,'../bad'),/ID/);
});
