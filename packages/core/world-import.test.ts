import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as doc from './document';
import {create,reduce,hash,assistantCompletionValidation,type Project} from './project';
import {planWorldImport,worldImportDiff,importSummaryCoverage,importReviewHash} from './world-import';
import {toolDefinitions,executeWorldTool} from './agent-tools';
import {taskToolCapabilities} from './agent-orchestration';
import {assistantPacket} from './assistant-context';
import {agentSystem,apiRequest,defaultSettings} from './providers';
import {harnessInput} from './harness';

function fixture(){
 const triggerDefinitions=Object.fromEntries(Array.from({length:17},(_,index)=>['Trigger '+index,{instructions:'Old wording '+index,effects:[{value:1}]}])),updated=Object.fromEntries(Object.entries(triggerDefinitions).reverse().map(([key,value])=>[key,{effects:value.effects,instructions:value.instructions.replace('Old','New')}]));
 const generated=Object.fromEntries(Array.from({length:200},(_,index)=>['__generated_quest_progress__/Quest '+index,{effects:[]}]));
 const initialGameState={heroesVersion:37,compatibilityRevision:16,triggerDefinitions,characterCreationMusic:'fantasy',parties:{'':{questTriggers:generated,quests:{Main:{description:'Authored quest'}},entities:{Ada:{hp:42}}}}};
 return {before:JSON.stringify({data:{world:{shortId:'WORLD',title:'Keep title',loadStatus:'ready',initialGameState},requestId:'old'}}),incoming:JSON.stringify({triggerDefinitions:updated,heroesVersion:37,worldVoices:{}})};
}
test('partial GameState import shows 17 authored trigger edits, not hundreds of omitted runtime deletions',()=>{
 const {before,incoming}=fixture(),plan=planWorldImport(before,incoming),report=worldImportDiff(before,plan.source);
 assert.equal(report.counts.world,17);assert.equal(report.counts.runtime,0);assert.equal(report.counts.structure,1);assert.equal(report.total,18);
 assert.deepEqual(report.sections,[{section:'triggerDefinitions',changed:17,added:0,removed:0,entities:17}]);
 assert.ok(plan.omitted.some(entry=>entry.path.at(-1)==='parties'));assert.equal(plan.wrapperAdjusted,true);
 assert.equal(doc.describe(plan.source,['data','world','initialGameState','parties','','questTriggers']).children.length,200);
 assert.equal(doc.read(plan.source,['data','world','title']),'"Keep title"');assert.equal(doc.read(plan.source,['data','requestId']),'"old"');
 assert.equal(doc.read(plan.source,['data','world','initialGameState','characterCreationMusic']),'"fantasy"');
 assert.ok(report.changes.every(change=>change.kind!=='order'));assert.equal(before,fixture().before);
});
test('merge preserves omitted unknown data, explicitly supplied nulls and arrays replace, and numbers stay exact',()=>{
 const before='{"heroesVersion":37,"custom":{"keep":9007199254740993,"edit":1},"list":[1,2],"clear":"yes","fraction":1.000,"large":9007199254740993}',incoming='{"large":9007199254740995,"fraction":1e0,"clear":null,"list":[3],"custom":{"edit":2}}',plan=planWorldImport(before,incoming);
 assert.equal(doc.read(plan.source,['custom','keep']),'9007199254740993');assert.equal(doc.read(plan.source,['custom','edit']),'2');assert.equal(doc.read(plan.source,['list']),'[3]');assert.equal(doc.read(plan.source,['clear']),'null');assert.equal(doc.read(plan.source,['large']),'9007199254740995');assert.equal(doc.read(plan.source,['fraction']),'1.000');assert.equal(doc.read(plan.source,['heroesVersion']),'37');
 assert.equal(worldImportDiff(before,plan.source).total,4);
});
test('replace is deliberately destructive but still ignores file-only noise and preserves linked identity/version fields',()=>{
 const before='{"shortId":"WORLD","title":"Existing","loadStatus":"ready","initialGameState":{"heroesVersion":37,"compatibilityRevision":16,"keep":9007199254740993,"remove":{"custom":true}}}',incoming='{"world":{"shortId":"OTHER","title":"Imported title","loadStatus":"broken","initialGameState":{"heroesVersion":36,"keep":9007199254740993}}}',plan=planWorldImport(before,incoming,{mode:'replace'},true);
 assert.equal(doc.read(plan.source,['shortId']),'"WORLD"');assert.equal(doc.read(plan.source,['loadStatus']),'"ready"');assert.equal(doc.read(plan.source,['title']),'"Imported title"');assert.equal(doc.read(plan.source,['initialGameState','heroesVersion']),'37');assert.equal(doc.read(plan.source,['initialGameState','compatibilityRevision']),'16');assert.throws(()=>doc.read(plan.source,['initialGameState','remove']));assert.equal(plan.omitted.length,0);
 assert.equal(worldImportDiff(before,plan.source).counts.world,2);
});
test('wrapper layout, escaped strings, key order and equivalent number spelling are not world-value changes',()=>{
 const before='{"data":{"world":{"shortId":"ID","initialGameState":{"heroesVersion":37,"custom":{"text":"A","number":1.000},"big":9007199254740993,"list":[{"a":1,"b":2}]}},"requestId":"one"}}',incoming='{"list":[{"b":2,"a":1e0}],"big":9007199254740993,"custom":{"number":1e0,"text":"\\u0041"},"heroesVersion":37}';
 assert.equal(worldImportDiff(before,incoming).total,0);assert.equal(planWorldImport(before,incoming).source,before);
 assert.equal(worldImportDiff('{"value":9007199254740993}','{"value":9007199254740995}').total,1);
 assert.equal(worldImportDiff('{"value":1e999999999999999999}','{"value":1e999999999999999998}').total,1);
 assert.equal(worldImportDiff('{"value":-0}','{"value":0}').total,1);
 assert.throws(()=>planWorldImport(before,'{"initialGameState":null}'),/object GameState/);
 assert.throws(()=>planWorldImport(before,'{"data":{"world":{"shortId":"ID"}}}'),/wrapper/);
 assert.equal(planWorldImport('{"heroesVersion":37,"data":{"custom":true}}','{"heroesVersion":37}').omitted.length,1);
});
test('generated and empty details are separate, while authored party quests, scripts and unknown fields remain world changes',()=>{
 const before='{"heroesVersion":37,"parties":{"":{"questTriggers":{"__generated_quest_progress__/Main":{"text":"a"}},"quests":{"Main":{"description":"a"}},"entities":{"Ada":{"hp":10}}}},"triggerDefinitions":{"Authored":{"script":"a"}},"unknown":1}',after=before.replaceAll('"a"','"b"').replace('"hp":10','"hp":9').replace('"unknown":1','"unknown":2').replace('"heroesVersion":37','"heroesVersion":38').replace('"parties":','"worldVoices":{},"parties":');
 const report=worldImportDiff(before,after);assert.equal(report.counts.world,3);assert.equal(report.counts.runtime,2);assert.equal(report.counts.structure,1);assert.equal(report.counts.compatibility,1);
 assert.equal(worldImportDiff(before,after,1,0,'world').changes.length,1);assert.equal(worldImportDiff(before,after,1,2,'world').nextOffset,null);assert.equal(worldImportDiff(before,after,1,1,'runtime').changes[0].category,'runtime');
 assert.equal(worldImportDiff('{"npcs":{"Empty":{}}}','{"npcs":{}}').counts.world,1);
});
test('bare GameState imports disclose envelope publication omissions and empty objects do not clear maps',()=>{
 const current='{"heroesVersion":37,"npcs":{"Ada":{"description":"Keep"}}}',incoming='{"world":{"title":"Incoming title","image":"https://example.test/cover.png","initialGameState":{"heroesVersion":37,"npcs":{}}}}';
 const merged=planWorldImport(current,incoming);assert.equal(merged.source,current);assert.match(merged.note,/publication fields .* are not imported/);assert.match(merged.note,/Empty objects do not clear maps/);
 const replaced=planWorldImport(current,incoming,{mode:'replace'});assert.equal(doc.read(replaced.source,['npcs']),'{}');assert.match(replaced.note,/publication fields .* are not imported/);
});
test('import mode changes are explicit, reversible, durable, stale-safe and reset selective choices',()=>{
 const source='{"heroesVersion":37,"a":1,"omitted":2}',incoming='{"a":3}';let project=create('p','World',source,1);
 project=reduce(project,{type:'stage',id:'import',title:'Import',kind:'import',source:incoming});let candidate=project.candidates[0];assert.equal(candidate.importOptions?.mode,'merge');assert.equal(candidate.importSource,incoming);
 project=reduce(project,{type:'candidateChange',id:'import',candidateHash:hash(candidate.source),path:['a'],kind:'changed',reject:true});
 project=JSON.parse(JSON.stringify(project));candidate=project.candidates[0];project=reduce(project,{type:'configureImport',id:'import',candidateHash:hash(candidate.source),importOptions:{mode:'replace'}});candidate=project.candidates[0];assert.deepEqual(candidate.rejectedChanges,[]);assert.throws(()=>doc.read(candidate.source,['omitted']));
 project=reduce(project,{type:'configureImport',id:'import',candidateHash:hash(candidate.source),importOptions:{mode:'merge'}});candidate=project.candidates[0];assert.equal(doc.read(candidate.source,['omitted']),'2');assert.equal(project.activeSource,source);
 assert.throws(()=>reduce(project,{type:'configureImport',id:'import',candidateHash:'old',importOptions:{mode:'replace'}}),/changed/);
 const stale=reduce(project,{type:'edit',path:['a'],source:'4',baseHash:hash(source)});assert.throws(()=>reduce(stale,{type:'configureImport',id:'import',candidateHash:hash(candidate.source),importOptions:{mode:'replace'}}),/world changed/);
 assert.throws(()=>reduce(stale,{type:'refreshImport',id:'import',candidateHash:hash(candidate.source),baseHash:hash(source)}),/world changed/);
 let refreshed=reduce(stale,{type:'refreshImport',id:'import',candidateHash:hash(candidate.source),baseHash:hash(stale.activeSource)});assert.equal(refreshed.activeSource,stale.activeSource);assert.equal(refreshed.candidates[0].baseHash,hash(stale.activeSource));assert.equal(doc.read(refreshed.candidates[0].source,['a']),'3');
 assert.throws(()=>reduce(refreshed,{type:'importCategorySelection',id:'import',candidateHash:'old',category:'all',reject:true}),/proposal changed/);
 refreshed=reduce(refreshed,{type:'importCategorySelection',id:'import',candidateHash:hash(refreshed.candidates[0].source),category:'all',reject:true});assert.equal(doc.selectChanges(refreshed.activeSource,refreshed.candidates[0].source,refreshed.candidates[0].rejectedChanges),refreshed.activeSource);
 assert.throws(()=>reduce(refreshed,{type:'importCategorySelection',id:'import',candidateHash:hash(refreshed.candidates[0].source),category:'guessed',reject:true}),/Choose an import category/);
 project=reduce(project,{type:'accept',id:'import'});assert.equal(doc.read(project.activeSource,['a']),'3');assert.equal(doc.read(project.activeSource,['omitted']),'2');assert.equal(project.remote.operations.length,0);
});
function summaryProject(){const {before,incoming}=fixture();let project=create('p','World',before,1);project=reduce(project,{type:'stage',id:'import',kind:'import',title:'Import',source:incoming});project=reduce(project,{type:'prepareTask',id:'summary',attempt:'attempt',kind:'plan',importReview:{candidateId:'import'}});return reduce(project,{type:'taskRunning',taskId:'summary',attempt:'attempt'});}
function readPage(project:Project,offset:number){return reduce(project,{type:'taskTool',taskId:'summary',attempt:'attempt',callId:'page-'+offset,name:'world_import_review',args:{offset}});}
test('assistant summaries are frozen, read only, paginated, evidence-bound and isolated from unrelated context',()=>{
 let project=summaryProject(),task=project.tasks[0];const capabilities=taskToolCapabilities(task),packet=assistantPacket({...project,memory:'unrelated private memory'},task);
 assert.deepEqual(toolDefinitions(false,capabilities).map(tool=>tool.name),['world_import_review']);assert.equal(packet.memory,'');assert.deepEqual(packet.history,[]);assert.equal(packet.editorContext,undefined);assert.ok(!JSON.stringify(packet).includes('unrelated private memory'));assert.ok(!JSON.stringify(packet).includes('Old wording'));
 assert.match(agentSystem(false,capabilities),/read-only Voyage import reviewer/);assert.equal(project.chat.length,0);
 assert.throws(()=>executeWorldTool(project,task,'propose_work_order',{},[],'unused',hash),/unavailable/);assert.throws(()=>executeWorldTool(project,task,'world_read',{path:[]},[],'unused',hash),/unavailable/);
 assert.throws(()=>reduce(project,{type:'taskDone',taskId:'summary',attempt:'attempt',text:'Made up summary'}),/Read world_import_review/);
 assert.throws(()=>assistantCompletionValidation(project,task,'Made up summary'),/Read world_import_review/);
 const active=project.activeSource,snapshot=task.importReview!;project=readPage(project,0);assert.equal(importSummaryCoverage(snapshot,project.tasks[0].toolJournal).complete,false);project=readPage(project,8);project=readPage(project,16);assert.deepEqual(importSummaryCoverage(snapshot,project.tasks[0].toolJournal),{covered:18,total:18,complete:true,truncated:false});
 assert.deepEqual(assistantCompletionValidation(project,task,'Read-only summary'),{valid:true});
 project=reduce(project,{type:'taskDone',taskId:'summary',attempt:'attempt',text:'17 trigger text fields change. Omitted party data stays.'});assert.equal(project.activeSource,active);assert.equal(project.candidates.length,1);assert.equal(project.tasks[0].state,'COMPLETED');assert.equal(project.chat.length,0);
 const candidate=project.candidates[0],oldFingerprint=snapshot.reviewHash;project=reduce(project,{type:'configureImport',id:'import',candidateHash:hash(candidate.source),importOptions:{mode:'replace'}});assert.notEqual(importReviewHash(project.activeSource,project.candidates[0].source,{mode:'replace'},[],hash),oldFingerprint);assert.equal(snapshot.after,task.importReview!.after);
});
test('API and CLI harness adapters infer restricted summary capabilities from their packet',()=>{
 const project=summaryProject(),packet=assistantPacket(project,project.tasks[0]),messages=[{role:'user' as const,text:JSON.stringify(packet)}],wire=JSON.parse(harnessInput(messages,false));assert.deepEqual(wire.tools.map((tool:any)=>tool.name),['world_import_review']);
 const profile={...defaultSettings().profiles[0],protocol:'openai' as const,baseUrl:'https://example.test/v1',model:'selected'};const request=apiRequest(profile as any,'test',messages,false),body=JSON.parse(request.body);assert.deepEqual(body.tools.map((tool:any)=>tool.function.name),['world_import_review']);
});
