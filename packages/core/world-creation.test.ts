import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hash,reduce} from './project';
import {toolDefinitions} from './agent-tools';
import {resumeIssue} from './agent-orchestration';
import {assistantPacket} from './assistant-context';
import {creationArtifactSpecs,creationBriefHash,creationInputHash,creationVisualHash,creationReadiness,createWorkspace,creationSeed,readCreation,recordCreationRead,updateCreation,worldCreationRubric} from './world-creation';
import {source,references,workspace,project,running,perfectReview} from '../../tests/creation-fixture';

test('source workspaces hash supplied text, preregister paths and reject ambiguous or excessive inputs',()=>{
 const result=workspace();assert.equal(result.documents[0].hash,hash(result.documents[0].text));assert.equal(result.profile,'universal');assert.equal(worldCreationRubric.version,'1.6.2');assert.equal(worldCreationRubric.gates.length,20);assert.ok(worldCreationRubric.readiness_v1_6_2_superseding);
 const input={id:'id',brief:'Create',documents:[{id:'doc',name:'doc.md',text:'Source'}]};
 for(const invalid of [{...input,documents:[]},...['invented','',null,false,0,['universal']].map(profile=>({...input,profile})),{...input,documents:[{id:'summary',name:'x',text:'Source'}]},{...input,documents:[...input.documents,...input.documents]},{...input,approved:true}])assert.throws(()=>createWorkspace(invalid,hash));
});
test('document reads are bounded, reassembled without gaps and bind to exact source hashes',()=>{
 const long='A'.repeat(26000),result=createWorkspace({id:'x',brief:'Create',documents:[{id:'doc',name:'long.md',text:long}]},hash);
 let next=result;for(let offset=0;offset<long.length;offset+=12000){const page=readCreation(next,'doc',offset,hash);assert.ok(page.text.length<=12000);next=recordCreationRead(next,'doc',offset,page.text.length);}
 assert.deepEqual(next.sourceReads![0].ranges,[[0,long.length]]);assert.equal(result.sourceReads,undefined);assert.throws(()=>readCreation(next,'doc',-1,hash));assert.equal(readCreation(next,'doc',30000,hash).nextOffset,null);
});
test('canon requires valid source lines and locked decisions cannot be overwritten',()=>{
 const result=workspace(),design=structuredClone(result.design);design.decisions[0].evidence[0].endLine=500;
 assert.throws(()=>updateCreation(result,'design',JSON.stringify(design),source,hash,2),/existing document lines/);
 design.decisions[0].evidence=[];assert.throws(()=>updateCreation(result,'design',JSON.stringify(design),source,hash,2),/Canon needs/);
 const locked={...result,design:{...result.design,decisions:result.design.decisions.map(decision=>({...decision,locked:true}))}};
 assert.throws(()=>updateCreation(locked,'design',JSON.stringify({...locked.design,decisions:[]}),source,hash,2),/locked/);
});
test('publication and artwork plans validate actual supported contracts and do not accept job states',()=>{
 const result=workspace();assert.throws(()=>updateCreation(result,'publication',JSON.stringify({title:'World',blurb:'Blurb',description:'',tags:Array(11).fill('tag')}),source,hash,2));
 assert.throws(()=>updateCreation(result,'artwork',JSON.stringify([{id:'fake',destinationId:'missing',prompt:'Art'}]),source,hash,2),/supported artwork/);
 assert.throws(()=>updateCreation(result,'jobs','[]',source,hash,2),/not agent-editable/);
});
test('creation tools require an approved whole-world creation task and stay out of reviewer capabilities',()=>{
 let result=running();assert.equal(result.tasks[0].creationId,result.creation!.id);const packet=assistantPacket(result,result.tasks[0]);assert.ok('creation' in packet&&packet.creation?.approved);
 assert.ok(toolDefinitions(true).some(tool=>tool.name==='creation_update'));assert.ok(!toolDefinitions(false).some(tool=>tool.name==='creation_update'));assert.ok(!toolDefinitions(true,{readOnly:true}).some(tool=>tool.name==='creation_read'));
 const call={type:'taskTool',taskId:'task',attempt:'attempt',callId:'publication',name:'creation_update',args:{section:'publication',source:JSON.stringify({...result.creation!.publication,title:'A new title'})}};
 result=reduce(result,call);assert.equal(result.tasks[0].toolJournal![0].state,'succeeded');assert.equal(result.creation!.publication.title,'A new title');assert.equal(result.activeSource,source);
 const revision=result.creation!.revision;result=reduce(result,call);assert.equal(result.creation!.revision,revision);assert.throws(()=>reduce(result,{...call,attempt:'old'}),/no longer/);
 const unrelated={...running(),tasks:running().tasks.map(task=>({...task,creationId:undefined}))};assert.equal(reduce(unrelated,call).tasks[0].toolJournal![0].state,'rejected');
});
test('served source coverage is journaled transactionally and cannot be claimed through a design update',()=>{
 let result=running();result={...result,creation:{...result.creation!,sourceReads:[]}};
 result=reduce(result,{type:'taskTool',taskId:'task',attempt:'attempt',callId:'source',name:'creation_read',args:{section:'research'}});
 assert.deepEqual(result.creation!.sourceReads![0].ranges,[[0,result.creation!.documents[0].text.length]]);
 assert.equal(result.tasks[0].toolJournal![0].state,'succeeded');assert.equal(result.tasks[0].toolJournal![0].result.untrusted,true);
});
test('changed creation brief blocks checkpoint continuation while design progress survives serialization',()=>{
 let result=running();result=reduce(result,{type:'recover'});assert.equal(resumeIssue(result,result.tasks[0],'desktop',hash),'');
 result=JSON.parse(JSON.stringify(result));result.creation!.brief+=' Changed';assert.match(resumeIssue(result,result.tasks[0],'desktop',hash),/brief changed/);assert.notEqual(creationBriefHash(result.creation!,hash),result.tasks[0].creationBriefHash);
});
test('artifact reservations are single-flight, recover as uncertain and require explicit failure retry',()=>{
 let result=project();const spec=creationArtifactSpecs(result.creation!,source,hash).find(spec=>spec.kind==='image')!;
 const reserve=(value:typeof result,extra:any={})=>reduce(value,{type:'creationJobStart',baseHash:hash(value.activeSource),expectedRevision:value.creation!.revision,id:spec.id,specHash:spec.specHash,attempt:'asset-attempt',routeHash:hash('route'),...extra});
 result=reserve(result);assert.throws(()=>reserve(result),/already running/);assert.throws(()=>reduce(result,{type:'configureCreation',baseHash:hash(source),workspace:{}}),/Finish current/);
 result=reduce(result,{type:'recover'});assert.equal(result.creation!.jobs[0].state,'uncertain');assert.throws(()=>reserve(result),/previous provider outcome/);
 result=reserve(result,{acknowledgeRetry:true,attempt:'retry'});assert.throws(()=>reduce(result,{type:'creationJobFinish',id:spec.id,attempt:'old',state:'ready',assetId:'a',assetHash:hash('bytes')}),/no longer/);
 result=reduce(result,{type:'creationJobFinish',id:spec.id,attempt:'retry',state:'ready',assetId:'a',assetHash:hash('bytes')});assert.equal(result.creation!.jobs[0].state,'ready');
});
test('artifact hashes invalidate changed geography selectively and ignore only image assignments',()=>{
 const first=workspace(),original=creationArtifactSpecs(first,source,hash),changed={...first,maps:first.maps.map(map=>({...map,water:'#334455'}))},updated=creationArtifactSpecs(changed,source,hash);
 assert.notEqual(original.find(spec=>spec.kind==='map')!.specHash,updated.find(spec=>spec.kind==='map')!.specHash);assert.equal(original.find(spec=>spec.kind==='image')!.specHash,updated.find(spec=>spec.kind==='image')!.specHash);
 const assigned=source.replace('"imageUrl":""','"imageUrl":"https://example.com/map.png"');assert.deepEqual(creationArtifactSpecs(first,assigned,hash),original);
 assert.notEqual(creationInputHash(first,source,hash),creationInputHash(first,assigned,hash));assert.equal(creationVisualHash(first,source,hash),creationVisualHash(first,assigned,hash));
 const retuned={...first,design:{...first.design,tone:'Ominous coastal mystery'}};assert.notEqual(creationArtifactSpecs(retuned,source,hash).find(spec=>spec.kind==='image')!.specHash,original.find(spec=>spec.kind==='image')!.specHash);
});
test('rubric numbers cannot override absent artwork, visual evidence or deterministic entity defects',()=>{
 let result=workspace();result=updateCreation(result,'review',JSON.stringify(perfectReview()),source,hash,5);const report=creationReadiness(result,source,references,hash);
 assert.equal(report.state,'blocked');assert.equal(report.gates.find((gate:any)=>gate.id==='G20').status,'NE');assert.equal(report.score.lower,92);assert.equal(report.score.upper,100);assert.ok(report.pending.length);assert.equal(report.official,false);
 const broken=source.replace('A red-haired guide wearing a blue wool coat.','').replace('"visualTags":["harbour","stone houses","sea wind"]','"visualTags":["sea","sea",""]');
 result=updateCreation(result,'review',JSON.stringify(perfectReview()),broken,hash,6);const failures=creationReadiness(result,broken,references,hash);assert.equal(failures.gates.find((gate:any)=>gate.id==='G17').status,'FAIL');assert.equal(failures.gates.find((gate:any)=>gate.id==='G16').status,'FAIL');
 const absentArea=broken.replace('A market square faces the harbour. A ferry departs from the east quay.','');assert.equal(creationReadiness(result,absentArea,references,hash).gates.find((gate:any)=>gate.id==='G19').status,'FAIL');
});
test('full static readiness is bound to source, uploaded assignments and explicitly inspected artifacts',()=>{
 let result=project();for(const spec of creationArtifactSpecs(result.creation!,source,hash)){
  result=reduce(result,{type:'creationJobStart',baseHash:hash(result.activeSource),expectedRevision:result.creation!.revision,id:spec.id,specHash:spec.specHash,attempt:spec.id,routeHash:hash('route')});
  result=reduce(result,{type:'creationJobFinish',id:spec.id,attempt:spec.id,state:'ready',assetId:spec.id,assetHash:hash(spec.id)});
  result=reduce(result,{type:'creationJobUrl',baseHash:hash(result.activeSource),id:spec.id,url:'https://example.com/'+encodeURIComponent(spec.id)+'.png'});
 }
 assert.match(result.activeSource,/9007199254740993/);
 assert.throws(()=>reduce(result,{type:'creationVisualReview',inputHash:creationVisualHash(result.creation!,result.activeSource,hash),report:'Inspected'}),/complete asset set/);
 result=reduce(result,{type:'creationVisualReview',scope:'all-required-assets',inputHash:creationVisualHash(result.creation!,result.activeSource,hash),report:'Inspected actual cover and map pixels against the source.'});
 result.creation=updateCreation(result.creation!,'review',JSON.stringify(perfectReview()),result.activeSource,hash,6);
 const report=creationReadiness(result.creation,result.activeSource,references,hash);assert.equal(report.state,'static-ready',JSON.stringify(report.blockers));assert.equal(report.score.lower,100);assert.equal(report.publication,'not-authorized');
 assert.equal(creationReadiness(result.creation,result.activeSource+' ',references,hash).state,'blocked');
});
test('new V37 seeds are generated from current codecs, not relabelled V36 worlds',()=>{
 const refs=JSON.parse(readFileSync('apps/workbench/public/references/sections.json','utf8')),seed=creationSeed(refs);assert.equal(JSON.parse(seed).heroesVersion,37);assert.deepEqual(JSON.parse(seed).npcs,{});assert.throws(()=>creationSeed([]),/snapshot/);
 const before=readFileSync('fixtures/blank-world.json','utf8');assert.equal(JSON.parse(before).heroesVersion,36);
});
test('host readiness paginates defects and returns no image prompts or unbounded source bodies',()=>{
 const result=reduce(running(),{type:'taskTool',taskId:'task',attempt:'attempt',callId:'readiness',name:'creation_read',args:{section:'readiness'},references});
 const receipt=result.tasks[0].toolJournal![0];assert.equal(receipt.state,'succeeded');assert.ok(JSON.stringify(receipt.result).length<128*1024);assert.equal(receipt.result.pending[0].prompt,undefined);
});
test('private-draft envelope adoption preserves artifact identities and does not regenerate identical world content',()=>{
 const result=workspace(),envelope='{"world":{"shortId":"DRAFT","title":"The Island Ferry","description":"'+result.publication.blurb+'","advancedDescription":"'+result.publication.description+'","initialGameState":'+source+'}}';
 const before=creationArtifactSpecs(result,source,hash),after=creationArtifactSpecs(result,envelope,hash);assert.deepEqual(before.map(({id,destinationId,specHash})=>({id,destinationId,specHash})),after.map(({id,destinationId,specHash})=>({id,destinationId,specHash})));
});
test('all preregistered specialist paths use their own section floors without applying undisclosed overlays',()=>{
 for(const profile of Object.keys(worldCreationRubric.adaptive_paths.profiles)){
  const result={...workspace(),profile};const report=creationReadiness(result,source,references,hash);assert.equal(report.profile,profile);for(const section of Object.values(report.sections))assert.ok(Number.isFinite(section.minimum));
 }
});
test('unversioned or advisory-schema worlds cannot acquire a G1 pass from a model assertion',()=>{
 const unknown=source.replace('"heroesVersion":37,',''),result=updateCreation(workspace(),'review',JSON.stringify(perfectReview()),unknown,hash,1);
 assert.equal(creationReadiness(result,unknown,[],hash).gates.find((gate:any)=>gate.id==='G1').status,'NE');
 const legacy=source.replace('"heroesVersion":37','"heroesVersion":36'),advisory=updateCreation(workspace(),'review',JSON.stringify(perfectReview()),legacy,hash,1);assert.equal(creationReadiness(advisory,legacy,references,hash).gates.find((gate:any)=>gate.id==='G1').status,'NE');
});
test('adaptation inventory rejects fake built paths and exposes unfinished or excluded source concepts',()=>{
 const result=workspace(),design=structuredClone(result.design);design.deliverables[0].paths=[['npcs','missing']];assert.throws(()=>updateCreation(result,'design',JSON.stringify(design),source,hash,1),/Path not found/);
 design.deliverables[0].status='planned';const planned=updateCreation(result,'design',JSON.stringify(design),source,hash,2),report=creationReadiness(planned,source,references,hash);assert.equal(report.inventory.planned,1);assert.ok(report.blockers.some(message=>message.includes('not built')));
 design.deliverables[0].status='excluded';design.deliverables[0].paths=[];design.deliverables[0].reason='An explicit adaptation scope exclusion for this test.';const excluded=updateCreation(result,'design',JSON.stringify(design),source,hash,3);assert.equal(creationReadiness(excluded,source,references,hash).inventory.excluded.length,1);
 excluded.design.decisions[0].locked=true;assert.ok(creationReadiness(excluded,source,references,hash).blockers.some(message=>message.includes('no completed adaptation')));
 const completed=structuredClone(result);completed.design.deliverables[0].reason='A different checklist explanation only.';assert.deepEqual(creationArtifactSpecs(completed,source,hash),creationArtifactSpecs(result,source,hash));
});
