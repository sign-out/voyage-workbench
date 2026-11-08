import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';

const bundle=readFileSync(new URL('../build/core-native.js',import.meta.url),'utf8');
const context=createContext({});
runInContext(bundle,context);
context.VoyageCore.setHasher(source=>createHash('sha256').update(source).digest('hex'));
const request=payload=>JSON.parse(context.VoyageCore.nativeRequest(JSON.stringify(payload)));
const reduce=(project,command)=>request({operation:'reduce',project,command:{...command,now:2}});
const references=[{section:'heroesVersion',schema:{_type:'literal',value:37}},{section:'value',schema:'number'}];
const source='{"heroesVersion":37,"value":1,"list":[],"exact":9007199254740993}';

test('native import merge, replace and read-only summary preserve omitted GameState and numeric spelling',()=>{
 const pretty='{\n "itemSettings":{"currencyName":"coin","tiers":{}},"parties":{"":{"arcs":{},"quests":{}}},"number":1.2300e+42\n}',compact='{"number":123e40,"parties":{"":{"quests":{},"arcs":{}}},"itemSettings":{"tiers":{},"currencyName":"coin"}}';
 assert.equal(request({operation:'proposalDiff',args:[pretty,compact]}).total,0);assert.equal(request({operation:'selectProposalChanges',args:[pretty,compact]}),pretty);
 const changed=compact.replace('"coin"','"silver"');let legacy=request({operation:'create',id:'legacy',name:'Legacy',source:pretty,now:1});legacy.candidates=[{id:'old',kind:'import',source:changed,baseHash:request({operation:'hash',source:pretty}),created:1}];
 legacy=reduce(legacy,{type:'accept',id:'old'});assert.equal(request({operation:'read',args:[legacy.activeSource,['number']]}),'1.2300e+42');assert.equal(request({operation:'read',args:[legacy.activeSource,['itemSettings','currencyName']]}),'"silver"');assert.equal(request({operation:'diff',args:[pretty,legacy.activeSource]}).total,1);
 const before='{"shortId":"WORLD","initialGameState":{"heroesVersion":37,"value":1,"party":{"exact":9007199254740993}}}',incoming='{"value":2}';
 let project=request({operation:'create',id:'p',name:'Import',source:before,now:1});project=reduce(project,{type:'stage',id:'import',kind:'import',source:incoming});
 assert.equal(project.candidates[0].importOptions.mode,'merge');assert.equal(request({operation:'read',args:[project.candidates[0].source,['initialGameState','party','exact']]}),'9007199254740993');
 assert.equal(request({operation:'worldImportDiff',args:[before,project.candidates[0].source]}).counts.world,1);
 project=reduce(project,{type:'prepareTask',id:'summary',attempt:'attempt',kind:'plan',importReview:{candidateId:'import'}});project=reduce(project,{type:'taskRunning',taskId:'summary',attempt:'attempt'});
 assert.deepEqual(request({operation:'toolDefinitions',args:[false,request({operation:'taskToolCapabilities',args:[project.tasks[0]]})]}).map(tool=>tool.name),['world_import_review']);
 project=reduce(project,{type:'taskTool',taskId:'summary',attempt:'attempt',callId:'read',name:'world_import_review',args:{offset:0}});assert.equal(project.tasks[0].toolJournal[0].result.counts.world,1);
 project=reduce(project,{type:'taskDone',taskId:'summary',attempt:'attempt',text:'One world value changes; omitted party data stays.'});assert.equal(project.activeSource,before);
 project=reduce(project,{type:'configureImport',id:'import',candidateHash:request({operation:'hash',source:project.candidates[0].source}),importOptions:{mode:'replace'}});assert.throws(()=>request({operation:'read',args:[project.candidates[0].source,['initialGameState','party']]}));
 project=reduce(project,{type:'edit',path:['initialGameState','value'],source:'3',baseHash:request({operation:'hash',source:project.activeSource})});
 project=reduce(project,{type:'refreshImport',id:'import',candidateHash:request({operation:'hash',source:project.candidates[0].source}),baseHash:request({operation:'hash',source:project.activeSource})});assert.equal(project.candidates[0].baseHash,request({operation:'hash',source:project.activeSource}));
 project=reduce(project,{type:'importCategorySelection',id:'import',candidateHash:request({operation:'hash',source:project.candidates[0].source}),category:'all',reject:true});assert.equal(request({operation:'selectChanges',args:[project.activeSource,project.candidates[0].source,project.candidates[0].rejectedChanges]}),project.activeSource);
});

test('native bridge builds and reads cached community help without changing GameState',()=>{
 const files={
  'schema.json':JSON.stringify({_type:'required',fields:{heroesVersion:{_type:'literal',value:37}}}),
  'wiki.json':JSON.stringify([{section:'npcs',title:'Characters',summary:'Voices.',filePath:['npcs'],body:'Advisory character help.'}]),
  'limits.json':JSON.stringify({schemaVersion:'V37',count:0,limits:[]}),
  'voice-catalog.json':JSON.stringify({schemaVersion:'V37',field:'voiceTag',count:1,voiceTags:['male gruff']}),
  'guides.json':'[]','base-world.json':'{ "heroesVersion":37, "exact":9007199254740993 }'
 };
 assert.deepEqual(request({operation:'communityReferenceRequests'}),['schema.json','wiki.json','limits.json','voice-catalog.json','guides.json','base-world.json']);
 assert.deepEqual(request({operation:'communityGuideRequests',args:[files['guides.json']]}),[]);
 const bundle=request({operation:'buildCommunityReferences',args:[files,1234]});
 const help=request({operation:'referenceHelp',args:[source,bundle.sections,'section','npcs']});
 assert.equal(help.text,'Advisory character help.');assert.equal(help.official,false);
 assert.equal(request({operation:'referenceHelp',args:[source,bundle.sections,'seed']}).text,files['base-world.json']);
 assert.equal(request({operation:'schemaGuidance',args:[source,bundle.sections,'heroesVersion']})[0].communityHelp,undefined);
 assert.equal(request({operation:'referenceHelp',args:['{"heroesVersion":36}',bundle.sections]}).available,false);
});

test('native compatibility profiles and revision-scoped references survive the ES5 bridge',()=>{
 assert.equal(request({operation:'coverRecommendation',args:['alpha']}).width,1280);
 assert.equal(request({operation:'coverRecommendation',args:['production']}).width,1000);
 assert.deepEqual(request({operation:'coverRecommendation',args:['beta']}),{width:1280,height:720});
 assert.equal(request({operation:'voyageProfile',args:['beta']}).apiBase,'https://api-beta.aidungeon.com/creator/v1');
 assert.equal(request({operation:'isVoyageEnvironment',args:['beta']}),true);
 const engineSource='{"initialGameState":{"heroesVersion":37,"compatibilityRevision":9}}',engineResponse='{"data":{"world":{"initialGameState":{"heroesVersion":37,"compatibilityRevision":10}},"savedVersion":{"heroesVersion":37,"compatibilityRevision":9},"pendingVersionUpgrade":{"sourceVersion":{"heroesVersion":37,"compatibilityRevision":9},"targetVersion":{"heroesVersion":37,"compatibilityRevision":10}}}}';
 const engine=request({operation:'worldEngineStatus',args:[engineResponse,engineSource,'beta','WORLD',1]});assert.match(engine.warning,/V37 \/ revision 9 → V37 \/ revision 10/);assert.equal(engine.environment,'beta');
 const catalog=[{section:'value',schema:'number',schemaVersion:37,compatibilityRevision:2,environment:'alpha'},{section:'value',schema:'string',schemaVersion:37,compatibilityRevision:1,environment:'production'}];
 const text='{"heroesVersion":37,"compatibilityRevision":2,"value":1}';
 assert.equal(request({operation:'selectReferences',args:[text,catalog,{environment:'alpha'}]}).length,1);
 assert.deepEqual(request({operation:'selectReferences',args:[text,catalog,{environment:'production'}]}),[]);
 const state=JSON.stringify({heroesVersion:37,itemTypes:{book:{mediaContent:'x'.repeat(4001)}}});
 const issues=request({operation:'releaseAdvisories',args:[state,'alpha','publish']});
 assert.equal(issues.length,1);assert.equal(issues[0].level,'warning');
 assert.deepEqual(request({operation:'releaseAdvisories',args:[state,'production','publish']}),[]);
 assert.deepEqual(request({operation:'releaseAdvisories',args:[state,'beta','publish']}),[]);
});

function running(kind='work',localEditMode='proposal-only',options={}){
 let project=request({operation:'create',id:'native',name:'Native harness',source,now:1});
 project=reduce(project,{type:'workOrder',baseHash:request({operation:'hash',source:project.activeSource}),order:{reviewedScope:true,objective:'Update values',requirements:[],allowedPaths:[['value'],['list']]}});
 project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind,prompt:'Inspect',localEditMode,hostPlatform:'desktop',route:{protocol:'openai',model:'frozen'},...options});
 return reduce(project,{type:'taskRunning',taskId:'task',attempt:'attempt'});
}

test('native save review adopts a bound downloaded snapshot without claiming exact confirmation',()=>{
 const originalSource='{"shortId":"WORLD","initialGameState":{"heroesVersion":37,"questTriggers":{}}}',addedSource=originalSource.replace('"questTriggers":{}','"questTriggers":{"generated":{"exact":9007199254740993}}');
 let added=request({operation:'create',id:'additive',name:'Additive',source:originalSource,now:1});added=reduce(added,{type:'remoteLink',worldId:'WORLD',environment:'alpha',etag:'"old"'});const addedPayload=request({operation:'payload',source:originalSource});added=reduce(added,{type:'savePrepare',id:'added-save',baseHash:request({operation:'hash',source:originalSource}),payload:addedPayload});added=reduce(added,{type:'saveState',id:'added-save',state:'SEND_ATTEMPTED'});added=reduce(added,{type:'saveAdditions',operationId:'added-save',baseHash:request({operation:'hash',source:originalSource}),payloadHash:request({operation:'hash',source:addedPayload}),source:addedSource,etag:'"added"',environment:'alpha',worldId:'WORLD'});
 assert.equal(added.remote.operations[0].automaticAdditions.total,1);assert.equal(added.activeSource,addedSource);assert.equal(added.remote.operations[0].state,'ACCEPTED');
 const original='{"shortId":"WORLD","initialGameState":{"heroesVersion":37,"exact":9007199254740993,"worldVoices":{}}}';
 const emptyComparison=request({operation:'compareRemoteWorlds',args:[request({operation:'payload',source:original}),request({operation:'payload',source:original.replace(',"worldVoices":{}','')})]});
 assert.equal(emptyComparison.matches,true);assert.deepEqual(emptyComparison.optionalEmptyCollections,[['world','initialGameState','worldVoices']]);
 const remote='{"shortId":"WORLD","initialGameState":{"heroesVersion":37,"exact":9007199254740993,"characterCreationMusic":"fantasy"}}';
 let project=request({operation:'create',id:'review',name:'Review',source:original,now:1});
 project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'"old"',envelopeSource:original});
 const payload=request({operation:'payload',source:original}),digest=request({operation:'hash',source:original});
 project=reduce(project,{type:'savePrepare',id:'save',baseHash:digest,payload});
 project=reduce(project,{type:'saveState',id:'save',state:'SEND_ATTEMPTED'});
 project=reduce(project,{type:'saveReview',id:'candidate',operationId:'save',baseHash:digest,payloadHash:request({operation:'hash',source:payload}),source:remote,environment:'alpha',worldId:'WORLD',etag:'"new"'});
 assert.equal(project.activeSource,original);assert.equal(project.remote.operations[0].state,'UNKNOWN');
 project=reduce(project,{type:'accept',id:'candidate'});
 assert.equal(project.activeSource,remote);assert.equal(project.remote.operations[0].state,'ACCEPTED');assert.equal(project.remote.etag,'"new"');
 assert.equal(request({operation:'exportWorldSource',args:[remote,'voyage']}),'{"heroesVersion":37,"exact":9007199254740993,"characterCreationMusic":"fantasy"}');
 assert.match(request({operation:'voyageSaveFeedback',args:[project.remote.operations[0]]}).detail,/not an exact read-back/);
});

function call(project,callId,name,args){
 return reduce(project,{type:'taskTool',taskId:'task',attempt:'attempt',callId,name,args,references});
}

test('built native tool and reference assets agree with the shared registry and UI',()=>{
 assert.equal(readFileSync(new URL('../android/app/src/main/assets/core-native.js',import.meta.url),'utf8'),bundle);
 for(const work of [true,false]){
  const name='tools-'+(work?'work':'plan')+'.json';
  const tools=JSON.parse(readFileSync(new URL('../android/app/src/main/assets/'+name,import.meta.url),'utf8'));
  assert.deepEqual(tools,request({operation:'toolDefinitions',args:[work]}));
  for(const toolName of ['world_reference_impact','world_diff','world_readiness','world_schema_coverage'])assert.ok(tools.some(tool=>tool.name===toolName));
 }
 const sections=readFileSync(new URL('../apps/workbench/public/references/sections.json',import.meta.url),'utf8');
 assert.equal(readFileSync(new URL('../dist/references/sections.json',import.meta.url),'utf8'),sections);
 assert.equal(readFileSync(new URL('../android/app/src/main/assets/public/references/sections.json',import.meta.url),'utf8'),sections);
});

test('built native bridge stages and replays one mutation without rounding authored numbers',()=>{
 const args={action:'insert',path:['list'],key:0,source:'9007199254740993'};
 let project=call(running(),'insert','world_edit',args);
 const staged=project.tasks[0].stagedSource;
 project=call(project,'insert','world_edit',{source:args.source,key:0,path:['list'],action:'insert'});
 assert.equal(project.tasks[0].toolJournal.length,1);
 assert.equal(project.tasks[0].stagedSource,staged);
 assert.equal(project.activeSource,source);
 assert.match(staged,/9007199254740993/);
 assert.equal((staged.match(/9007199254740993/g)||[]).length,2);
 assert.throws(()=>call(project,'insert','world_edit',{...args,source:'2'}),/reused/);
});
test('built native bridge persists source-to-world evidence and cannot let an agent claim generated assets',()=>{
 let project=request({operation:'create',id:'creation-native',name:'Creation',source,now:1});
 project=reduce(project,{type:'configureCreation',baseHash:request({operation:'hash',source}),workspace:{id:'creation',brief:'Build a complete coastal world with maps and cover.',targetEnvironment:'alpha',documents:[{id:'research',name:'research.md',text:'An island port.'}]}});
 assert.equal(project.creation.targetEnvironment,'alpha');
 project=reduce(project,{type:'approveCreation',baseHash:request({operation:'hash',source}),expectedRevision:project.creation.revision});
 project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work',hostPlatform:'android',route:{protocol:'openai',model:'fixture'}});
 project=reduce(project,{type:'taskRunning',taskId:'task',attempt:'attempt'});
 project=call(project,'source','creation_read',{section:'research'});
 assert.deepEqual(project.creation.sourceReads[0].ranges,[[0,'An island port.'.length]]);
 project=call(project,'publication','creation_update',{section:'publication',source:JSON.stringify({title:'Island Port',blurb:'Arrive at the island port and choose your next voyage.',description:'A coastal adventure.',tags:['Adventure']})});
 assert.equal(project.creation.publication.title,'Island Port');assert.equal(project.activeSource,source);
 project=call(project,'forged-assets','creation_update',{section:'jobs',source:'[]'});assert.equal(project.tasks[0].toolJournal.at(-1).state,'rejected');assert.deepEqual(project.creation.jobs,[]);
});

test('built native journaled section checkpoints preserve host-owned storage receipts and replay without duplicating sections',()=>{
 let project=call(running(),'edit','world_edit',{action:'replace',path:['value'],source:'2'});
 const checkpoint={type:'taskTool',taskId:'task',attempt:'attempt',callId:'section',name:'world_checkpoint',args:{label:'Value',paths:[['value']]},sectionCheckpointId:'host-section',references};
 project=reduce(project,checkpoint);
 const task=project.tasks[0],receipt=task.toolJournal.at(-1);
 assert.equal(receipt.state,'succeeded');assert.equal(receipt.result.checkpoint.id,'host-section');assert.equal(task.sectionCheckpoints.length,1);
 assert.equal(task.sectionCheckpoints[0].sourceHash,request({operation:'hash',source:task.stagedSource}));
 assert.equal(project.activeSource,source);
 project=reduce(project,{...checkpoint,sectionCheckpointId:'new-host-id',sectionBaseSource:task.stagedSource});
 assert.equal(project.tasks[0].sectionCheckpoints.length,1);assert.equal(project.tasks[0].toolJournal.length,2);
 assert.deepEqual(project.tasks[0].toolJournal.at(-1),receipt);
});

test('built native bridge journals invalid actions and planning permission failures',()=>{
 for(const [kind,args] of [['work',{action:'invalid',path:['value'],source:'2'}],['plan',{action:'replace',path:['value'],source:'2'}]]){
  const project=call(running(kind),'bad','world_edit',args);
  assert.equal(project.tasks[0].toolJournal[0].state,'rejected');
  assert.equal(project.tasks[0].stagedSource,source);
  assert.equal(project.activeSource,source);
 }
});

test('built native completion gates require matching local evidence, not provider assertions',()=>{
 for(const [edit,catalog,state,evidence] of [['2',references,'APPLIED','pass'],['2',[],'PROPOSAL_READY','review'],['"invalid"',references,'PROPOSAL_READY','blocked']]){
  const project=call(running('work','automatic'),'edit','world_edit',{action:'replace',path:['value'],source:edit});
  const completed=reduce(project,{type:'taskDone',taskId:'task',attempt:'attempt',references:catalog,text:'Everything is valid.'});
  assert.equal(completed.tasks[0].state,state);
  assert.equal(completed.tasks[0].completionEvidence.state,evidence);
  assert.equal(completed.tasks[0].completionEvidence.official,false);
  if(state==='APPLIED')assert.equal(completed.tasks[0].completionEvidence.sourceHash,request({operation:'hash',source:completed.activeSource}));
  else assert.equal(completed.activeSource,source);
 }
});

test('built native delegation persists a scoped advisory review without granting mutation tools',()=>{
 let project=call(running('work','proposal-only',{allowDelegation:true}),'delegate','delegate_review',{objective:'Inspect value',paths:[['value']]});
 const child=project.tasks[0];assert.equal(child.kind,'review');
 assert.deepEqual(request({operation:'toolDefinitions',args:[false,{readOnly:true}]}).map(tool=>tool.name),['world_read','world_children','world_schema','world_schema_coverage']);
 project=reduce(project,{type:'taskRunning',taskId:child.id,attempt:child.attempt});
 project=reduce(project,{type:'taskTool',taskId:child.id,attempt:child.attempt,callId:'edit',name:'world_edit',args:{action:'replace',path:['value'],source:'99'},references});
 assert.equal(project.tasks[0].toolJournal[0].state,'rejected');
 project=reduce(project,{type:'taskDone',taskId:child.id,attempt:child.attempt,text:'Advisory only.'});
 project=reduce(project,{type:'resolveDelegation',taskId:'task',attempt:'attempt',childTaskId:child.id});
 const receipt=project.tasks.find(task=>task.id==='task').toolJournal[0];assert.equal(receipt.state,'succeeded');assert.equal(receipt.result.summary,'Advisory only.');assert.equal(project.activeSource,source);
});

test('built native Android checkpoint continuation preserves staged source and prior attempt evidence',()=>{
 let project=call(running('work','proposal-only',{autoResume:true,hostPlatform:'android'}),'edit','world_edit',{action:'insert',path:['list'],key:0,source:'9007199254740993'});
 const staged=project.tasks[0].stagedSource;project=reduce(project,{type:'recover'});
 assert.equal(request({operation:'resumeGuidance',args:[project,'task','android']}).allowed,true);
 project=reduce(project,{type:'resumeTask',taskId:'task',attempt:'attempt',newAttempt:'continued',hostPlatform:'android'});
 assert.equal(project.tasks[0].state,'PREPARED');assert.equal(project.tasks[0].stagedSource,staged);assert.equal(project.tasks[0].toolJournal[0].attempt,'attempt');assert.equal(project.tasks[0].resumes.length,1);
 assert.equal(request({operation:'orchestrationCapabilities',args:['android','openai']}).delegation,false);
});
test('built native creation restoration preserves research and exact world text without importing task or remote authority',()=>{
 let original=request({operation:'create',id:'original',name:'Original',source,now:1});
 original=reduce(original,{type:'configureCreation',baseHash:request({operation:'hash',source}),workspace:{id:'creation',brief:'Build the supplied island setting.',documents:[{id:'research',name:'Research.md',text:'A coastal island.'}]}});
 let restored=request({operation:'create',id:'restored',name:'Restored',source,now:1});
 restored=reduce(restored,{type:'restoreCreation',baseHash:request({operation:'hash',source}),workspace:original.creation,creationId:'fresh-creation'});
 assert.equal(restored.activeSource,source);assert.match(restored.activeSource,/9007199254740993/);assert.equal(restored.creation.id,'fresh-creation');assert.deepEqual(restored.creation.documents,original.creation.documents);
 assert.equal(restored.remote.worldId,'');assert.deepEqual(restored.tasks,[]);assert.equal(restored.workOrder.approvalBaseHash,undefined);assert.equal(restored.creation.review,undefined);
});
test('built native vision functions preserve pixel inputs, freeze routes and reject incomplete findings',()=>{
 const settings={profiles:[{id:'vision',name:'Vision',protocol:'openai',baseUrl:'https://example.com/v1',model:'vision'}],routes:{building:{profileId:'vision',model:'vision'},planning:{profileId:'vision',model:'vision'},map:{profileId:'vision',model:'vision'},artwork:{profileId:'',model:''}}};
 const route=request({operation:'creationVisualRoute',args:[settings]});
 assert.throws(()=>request({operation:'creationVisualRoute',args:[settings,{...route,model:'unapproved'}]}),/route changed/);
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=',wire=request({operation:'visionReviewRequest',args:[route,'','Inspect the actual pixels',[{id:'cover',dataUrl:png}]]});
 assert.equal(JSON.parse(wire.body).messages[0].content[2].image_url.url,png);
 const report={assets:[{id:'cover',status:'uncertain',observations:'A small face is visible.',sourceFidelity:'Identity cannot be established at this resolution.',fix:'Inspect the original image before resolving identity.'}],summary:'Uncertainty retained.'};
 assert.equal(request({operation:'creationVisualReviewResult',args:['codex',{text:JSON.stringify(report)},['cover']]}).assets[0].status,'uncertain');
 assert.throws(()=>request({operation:'creationVisualReviewResult',args:['codex',{text:JSON.stringify(report)},['other']]}),/missing or duplicate/);
});
