import test from 'node:test';
import assert from 'node:assert/strict';
import {creationVisualReviewInput,creationVisualReviewResult,creationVisualRoute} from './creation-visual';
import {creationArtifactSpecs,creationVisualHash,creationVisualFindingsHash,creationReadiness,creationUnresolvedVisualFindings,updateCreation} from './world-creation';
import {defaultSettings} from './providers';
import {visionReviewRequest} from './covers';
import {hash,reduce} from './project';
import {project as fixture,references,perfectReview} from '../../tests/creation-fixture';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=';
function ready(){const project=fixture();project.creation!.jobs=creationArtifactSpecs(project.creation!,project.activeSource,hash).map((spec,index)=>({id:spec.id,specHash:spec.specHash,state:'ready',attempt:'done',created:1,assetId:'asset-'+index,assetHash:hash('pixels')}));return project;}
function finding(id:string,status='pass'){return {id,status,observations:'The visible harbour has stone buildings.',sourceFidelity:'The island setting agrees with the supplied source excerpt.',fix:status==='pass'?'':'Inspect the uncertain detail.'};}
test('whole-package vision uses completed hash-bound pixels, authored briefs and bounded source excerpts',()=>{
 const project=ready(),workspace=project.creation!,images=workspace.jobs.map(job=>({id:job.id,assetHash:job.assetHash!,dataUrl:png})),inputHash=creationVisualHash(workspace,project.activeSource,hash);
 const input=creationVisualReviewInput(workspace,project.activeSource,inputHash,images,hash);assert.equal(input.images.length,2);assert.match(input.prompt,/The town is on a coastal island/);assert.match(input.prompt,/untrusted reference data/);assert.match(input.prompt,/uncertain/);
 assert.throws(()=>creationVisualReviewInput(workspace,project.activeSource,hash('old'),images,hash),/changed/);
 assert.throws(()=>creationVisualReviewInput(workspace,project.activeSource,inputHash,[images[0],images[0]],hash),/distinct/);
 assert.throws(()=>creationVisualReviewInput(workspace,project.activeSource,inputHash,[{...images[0],assetHash:hash('wrong')}],hash),/distinct/);
 assert.throws(()=>creationVisualReviewInput(workspace,project.activeSource,inputHash,Array(5).fill(images[0]),hash),/four/);
});
test('review parsing rejects missing/duplicate findings, unsupported claims and evidence-free passes',()=>{
 const response=(assets:any[])=>({text:JSON.stringify({assets,summary:'Observed pixels only.'})});
 assert.equal(creationVisualReviewResult('codex',response([finding('cover')]),['cover']).official,false);
 for(const assets of [[],[finding('wrong')],[finding('cover'),finding('cover')],[{...finding('cover'),observations:''}],[finding('cover','officially-accepted')],[{...finding('cover','fail'),fix:''}]])assert.throws(()=>creationVisualReviewResult('codex',response(assets),['cover']));
});
test('all supported API routes send actual pixel parts and route changes fail closed',()=>{
 const settings=defaultSettings();settings.profiles.push({id:'vision',name:'Vision',protocol:'openai',baseUrl:'https://example.com/v1',model:'vision'});settings.routes.building={profileId:'vision',model:'vision'};
 const route=creationVisualRoute(settings);
 for(const protocol of ['openai','openai-responses','anthropic','gemini'] as const){const wire=visionReviewRequest({...route,protocol},'private-key','Inspect these pixels',[{id:'cover',dataUrl:png}]);assert.match(wire.body,/iVBOR/);assert.match(wire.body,/Inspect these pixels/);}
 settings.profiles.find(profile=>profile.id==='vision')!.baseUrl='https://changed.example/v1';assert.throws(()=>creationVisualRoute(settings,route),/route changed/);
});
test('visual findings retain failures, reject stale batches and invalidate prior rubric conclusions',()=>{
 let project=ready();const workspace=project.creation!,inputHash=creationVisualHash(workspace,project.activeSource,hash),ids=workspace.jobs.map(job=>job.id),report={assets:ids.map(id=>finding(id,'uncertain')),summary:'One detail cannot be established.'};
 project.creation=updateCreation(workspace,'review',JSON.stringify(perfectReview()),project.activeSource,hash,2);
 project=reduce(project,{type:'creationVisualBatch',inputHash,routeHash:hash('route'),ids,report});assert.equal(project.creation!.visualProgress!.reports.length,1);
 assert.throws(()=>reduce(project,{type:'creationVisualBatch',inputHash,routeHash:hash('route'),ids,report}),/already/);
 assert.throws(()=>reduce(project,{type:'creationVisualBatch',inputHash:hash('stale'),routeHash:hash('route'),ids,report}),/current/);
 project=reduce(project,{type:'creationVisualReview',scope:'all-required-assets',inputHash,report:JSON.stringify(report),outcome:'uncertain'});
 assert.equal(project.creation!.review,undefined);assert.ok(creationReadiness(project.creation!,project.activeSource,references,hash).blockers.some(blocker=>blocker.includes('unresolved defects')));
});
test('a partial failed batch immediately blocks old passing evidence and manual recording cannot silently erase failures',()=>{
 let project=ready();const workspace=project.creation!,inputHash=creationVisualHash(workspace,project.activeSource,hash),ids=[workspace.jobs[0].id];
 project.creation=updateCreation(workspace,'review',JSON.stringify(perfectReview()),project.activeSource,hash,2);project.creation.visualReview={inputHash,report:'Previously inspected',outcome:'pass',created:1};
 const report={assets:ids.map(id=>finding(id,'fail')),summary:'Visible identity mismatch.'};
 project=reduce(project,{type:'creationVisualBatch',inputHash,routeHash:hash('route'),ids,report});
 assert.equal(project.creation!.review,undefined);assert.equal(Boolean(project.creation!.visualReview),false);assert.equal(creationUnresolvedVisualFindings(project.creation!,project.activeSource,hash).length,1);
 assert.ok(creationReadiness(project.creation!,project.activeSource,references,hash).blockers.some(blocker=>blocker.includes('unresolved defects')));
 project=reduce(project,{type:'creationVisualReview',scope:'all-required-assets',inputHash,report:JSON.stringify(report),outcome:'fail'});
 project=reduce(project,{type:'creationVisualReview',scope:'all-required-assets',inputHash,report:JSON.stringify(report)});assert.equal(project.creation!.visualReview!.outcome,'fail');
 const resolve={type:'creationVisualReview',scope:'all-required-assets',inputHash,report:'I inspected every image and resolved the finding.',resolveFindings:true,findingsHash:creationVisualFindingsHash(project.creation!,project.activeSource,hash),resolution:'The apparent mismatch is a labelled statue, not the referenced character.'};
 assert.throws(()=>reduce(project,{...resolve,findingsHash:hash('old')}),/current findings/);assert.throws(()=>reduce(project,{...resolve,resolution:'Okay'}),/rationale/);
 project=reduce(project,resolve);assert.equal(project.creation!.visualReview!.outcome,'pass');assert.equal(creationUnresolvedVisualFindings(project.creation!,project.activeSource,hash).length,0);assert.equal(project.creation!.visualResolution!.reason,resolve.resolution);
 const nextIds=[project.creation!.jobs[1].id];project=reduce(project,{type:'creationVisualBatch',inputHash,routeHash:hash('route'),ids:nextIds,report:{assets:nextIds.map(id=>finding(id,'uncertain')),summary:'New uncertainty on another image.'}});assert.ok(creationUnresolvedVisualFindings(project.creation!,project.activeSource,hash).length>0);
});
test('changing review routes or saving passing batches does not discard unresolved findings for unchanged pixels',()=>{
 let project=ready();const inputHash=creationVisualHash(project.creation!,project.activeSource,hash),ids=[project.creation!.jobs[0].id];
 project=reduce(project,{type:'creationVisualBatch',inputHash,routeHash:hash('first-route'),ids,report:{assets:ids.map(id=>finding(id,'fail')),summary:'Visible defect.'}});
 project=reduce(project,{type:'creationVisualBatch',inputHash,routeHash:hash('second-route'),ids,report:{assets:ids.map(id=>finding(id)),summary:'Another opinion.'}});
 assert.equal(creationUnresolvedVisualFindings(project.creation!,project.activeSource,hash).length,1);
});
