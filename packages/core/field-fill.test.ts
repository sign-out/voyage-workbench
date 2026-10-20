import assert from 'node:assert/strict';
import test from 'node:test';
import {fieldFillCandidates,fieldFillSnapshot,parseFieldFill,applyFieldFill,undoFieldFill,fieldFillChangeMatches} from './field-fill';
import {create,reduce,hash,nativeRequest} from './project';
import {assistantPacket} from './assistant-context';
import {agentSystem,apiRequest,toolDefinitions,type TaskRoute} from './providers';
import {harnessInput} from './harness';

const source='{"title":"Authored","description":"","npcs":{"one":{"name":"New character","description":"","gender":"","ref":"","image":"","script":"","metadata":{"description":""}}},"exact":9007199254740993123}';
const input={source,path:[],instructions:'A windswept maritime setting.'};
const result=[{path:['description'],value:'A lantern-lit coast.'}];
function prepared(){const project=create('p','World','{"title":"Active world","description":""}',1);project.chat=[{role:'user',text:'Secret chat'}];project.memory='Secret memory';project.builderNotes=[{id:'note',path:[],text:'Secret note',created:1,updated:1} as any];return reduce(project,{type:'prepareTask',id:'fill',attempt:'one',kind:'plan',fieldFill:input});}

test('candidates are existing blank prose or explicitly declared matching defaults only',()=>{
 assert.deepEqual(fieldFillCandidates(source,[]),[{path:['description'],before:''},{path:['npcs','one','description'],before:''}]);
 assert.deepEqual(fieldFillCandidates(source,['npcs','one'],[{path:['npcs','one','name'],value:'New character'}]),[{path:['npcs','one','name'],before:'New character'},{path:['npcs','one','description'],before:''}]);
 assert.deepEqual(fieldFillCandidates(source,['title']),[]);
 assert.deepEqual(fieldFillCandidates('{"__proto__":{"description":""}}',[]),[]);
 assert.deepEqual(fieldFillCandidates('{"worldBackground":"","aiGuidance":"","basicInfo":"","storyStart":"","traitNarrativeEffects":"","gender":"","type":""}',[]).map(field=>field.path[0]),['worldBackground','aiGuidance','basicInfo','storyStart','traitNarrativeEffects']);
 for(const path of [['npcs','one','gender'],['npcs','one','ref'],['npcs','one','metadata','description']])assert.throws(()=>fieldFillCandidates(source,[],[{path,value:''}]),/Ineligible/);
 assert.throws(()=>fieldFillCandidates(source,[],[{path:['title'],value:'Untouched'}]),/no longer matches/);
 assert.throws(()=>fieldFillCandidates(source,['npcs'],[{path:['title'],value:'Authored'}]),/Ineligible/);
});

test('parsing permits subsets but rejects additions, authored values, types and duplicate targets',()=>{
 const snapshot=fieldFillSnapshot(input);assert.deepEqual(parseFieldFill(JSON.stringify(result),snapshot),result);assert.deepEqual(parseFieldFill('[]',snapshot),[]);
 for(const value of [{result},[{path:['title'],value:'Overwrite'}],[{path:['missing'],value:'Insert'}],[{path:['description'],value:3}],[{path:['description'],value:''}],[{...result[0],extra:true}],[result[0],result[0]]])assert.throws(()=>parseFieldFill(JSON.stringify(value),snapshot));
 assert.throws(()=>parseFieldFill('```json\n[]\n```',snapshot));
 assert.throws(()=>fieldFillSnapshot({...input,path:['__proto__']}));
 assert.throws(()=>fieldFillSnapshot({...input,instructions:'x'.repeat(10001)}));
 assert.throws(()=>fieldFillSnapshot({...input,source:' '.repeat(16*1024*1024+1)}));
 const tooMany=JSON.stringify({npcs:Array.from({length:201},()=>({description:''}))});assert.throws(()=>fieldFillCandidates(tooMany,[]),/smaller section/);
 assert.throws(()=>parseFieldFill(JSON.stringify([{path:['description'],value:'x'.repeat(20001)}]),snapshot));
});

test('apply and undo preserve authored defaults, exact numbers and subsequent edits without a hash gate',()=>{
 const defaults=[{path:['npcs','one','name'],value:'New character'}],snapshot=fieldFillSnapshot({...input,defaults});
 const values=[...result,{path:['npcs','one','name'],value:'Captain Vale'},{path:['npcs','one','description'],value:'A navigator.'}];
 const changed=source.replace('"description":""','"description":"User draft"'),applied=applyFieldFill(changed,snapshot,values);
 assert.equal(applied.changes.length,2);assert.match(applied.source,/User draft/);assert.match(applied.source,/9007199254740993123/);
 const edited=applied.source.replace('Captain Vale','Captain User'),undone=undoFieldFill(edited,applied.changes);
 assert.equal(undone.changes.length,1);assert.match(undone.source,/Captain User/);assert.match(undone.source,/"description":""/);
 const restored=undoFieldFill(applied.source,applied.changes);assert.equal(restored.source,changed);
 assert.equal(applyFieldFill('{"title":"Other"}',snapshot,result).changes.length,0);
 assert.deepEqual(JSON.parse(nativeRequest(JSON.stringify({operation:'fieldFillCandidates',args:[source,[]]}))),snapshot.fields.filter(field=>field.before===''));
});

test('array guards skip fill after reorder, removal, insertion or replacement without blocking nonarray fields',()=>{
 const original={title:'World',description:'',npcs:[{id:'first',description:''},{id:'second',description:''}]},arraySource=JSON.stringify(original),snapshot=fieldFillSnapshot({source:arraySource,path:[],instructions:''});
 const values=[{path:['description'],value:'World prose'},{path:['npcs',0,'description'],value:'First character prose'}];
 const field=snapshot.fields.find(field=>field.path[0]==='npcs')!;
 assert.deepEqual(field.guards?.map(guard=>guard.path),[['npcs']]);assert.equal(field.guards?.[0].hash,hash(JSON.stringify(original.npcs)));
 const variants=[original.npcs.slice().reverse(),original.npcs.slice(1),[{id:'new',description:''},...original.npcs],[{id:'replacement',description:''},original.npcs[1]]];
 for(const npcs of variants){const current=JSON.stringify({...original,npcs}),applied=applyFieldFill(current,snapshot,values);assert.deepEqual(applied.changes.map(change=>change.path),[['description']]);assert.deepEqual(JSON.parse(applied.source).npcs,npcs);}
 const unrelated=JSON.stringify({...original,title:'Later title',other:'New nonarray field'}),applied=applyFieldFill(unrelated,snapshot,values);
 assert.equal(applied.changes.length,2);assert.equal(JSON.parse(applied.source).title,'Later title');assert.equal(JSON.parse(applied.source).npcs[0].description,'First character prose');
});

test('Undo array guards preserve a different authored record with coincidentally matching generated text',()=>{
 const generated='Coincidentally identical prose',original={title:'World',npcs:[{id:'first',description:''},{id:'authored',description:generated}]},arraySource=JSON.stringify(original),snapshot=fieldFillSnapshot({source:arraySource,path:['npcs',0],instructions:''});
 const applied=applyFieldFill(arraySource,snapshot,[{path:['npcs',0,'description'],value:generated}]),filled=JSON.parse(applied.source);
 assert.equal(applied.changes.length,1);assert.equal(applied.changes[0].guards?.[0].hash,hash(JSON.stringify(filled.npcs)));
 const variants=[filled.npcs.slice().reverse(),filled.npcs.slice(1),[{id:'inserted',description:generated},...filled.npcs],[{id:'replacement',description:generated},filled.npcs[1]]];
 for(const npcs of variants){const current=JSON.stringify({...filled,npcs}),undone=undoFieldFill(current,applied.changes);assert.equal(fieldFillChangeMatches(current,applied.changes[0]),false);assert.equal(undone.source,current);assert.deepEqual(undone.changes,[]);assert.equal(JSON.parse(undone.source).npcs[0].description,generated);}
 const unrelated=JSON.stringify({...filled,title:'Later title',other:'Keep me'}),undone=undoFieldFill(unrelated,applied.changes);
 assert.equal(undone.changes.length,1);assert.equal(JSON.parse(undone.source).npcs[0].description,'');assert.equal(JSON.parse(undone.source).npcs[1].description,generated);assert.equal(JSON.parse(undone.source).title,'Later title');assert.equal(JSON.parse(undone.source).other,'Keep me');
 assert.equal(fieldFillChangeMatches(unrelated,applied.changes[0]),true);assert.equal(fieldFillChangeMatches(undone.source,applied.changes[0]),false);
});

test('array guard checks use pre-operation source and receipts hash the fully completed operation',()=>{
 const arraySource='{"description":"","npcs":[{"id":"first","description":"","background":""},{"id":"second","description":""}]}',snapshot=fieldFillSnapshot({source:arraySource,path:[],instructions:''});
 const values=[{path:['npcs',0,'description'],value:'First prose'},{path:['npcs',0,'background'],value:'First history'},{path:['npcs',1,'description'],value:'Second prose'}],applied=applyFieldFill(arraySource,snapshot,values);
 assert.equal(applied.changes.length,3);assert(applied.changes.every(change=>change.guards?.[0].hash===applied.changes[0].guards?.[0].hash));
 const undone=undoFieldFill(applied.source,applied.changes);assert.equal(undone.changes.length,3);assert.equal(undone.source,arraySource);
 assert.equal(undoFieldFill(undone.source,undone.changes).source,applied.source);
 const outsideEdit=applied.source.replace('"description":""','"description":"User prose"');assert.equal(undoFieldFill(outsideEdit,applied.changes).changes.length,3);
 const insideEdit=applied.source.replace('First history','User history');assert.equal(undoFieldFill(insideEdit,applied.changes).changes.length,0);
});

test('all nested array ancestors are guarded and missing or malformed guard metadata fails closed',()=>{
 const arraySource='{"groups":[{"id":"one","npcs":[{"id":"first","description":""}]},{"id":"two","npcs":[{"id":"second","description":""}]}]}',path=['groups',0,'npcs',0,'description'],snapshot=fieldFillSnapshot({source:arraySource,path,instructions:''}),values=[{path,value:'Generated'}];
 assert.deepEqual(snapshot.fields[0].guards?.map(guard=>guard.path),[['groups'],['groups',0,'npcs']]);
 const moved=JSON.parse(arraySource);moved.groups.reverse();assert.deepEqual(applyFieldFill(JSON.stringify(moved),snapshot,values).changes,[]);
 const applied=applyFieldFill(arraySource,snapshot,values);assert.equal(applied.changes[0].guards?.length,2);assert.equal(undoFieldFill(applied.source,applied.changes).source,arraySource);
 const missing={...snapshot,fields:snapshot.fields.map(({guards,...field})=>field)};assert.deepEqual(applyFieldFill(arraySource,missing,values).changes,[]);
 const stripped=applied.changes.map(({guards,...change})=>change);assert.deepEqual(undoFieldFill(applied.source,stripped).changes,[]);
 assert.equal(fieldFillChangeMatches(applied.source,stripped[0]),false);assert.equal(fieldFillChangeMatches('invalid JSON',applied.changes[0]),false);
 const malformed=applied.changes.map(change=>({...change,guards:[{path:['groups'],hash:'invalid'}]}));assert.deepEqual(undoFieldFill(applied.source,malformed).changes,[]);
 const rootSource='[{"description":""},{"description":""}]',rootSnapshot=fieldFillSnapshot({source:rootSource,path:[0,'description'],instructions:''});assert.deepEqual(rootSnapshot.fields[0].guards?.map(guard=>guard.path),[[]]);
 const rootApplied=applyFieldFill(rootSource,rootSnapshot,[{path:[0,'description'],value:'Root array prose'}]);assert.equal(undoFieldFill(rootApplied.source,rootApplied.changes).source,rootSource);
});

test('isolated tasks freeze supplied draft context and persist only validated result',()=>{
 const project=prepared(),task=project.tasks[0],packet=assistantPacket(project,task);
 assert.equal(task.baseSource,source);assert.equal(task.baseHash,hash(source));assert.equal(task.fieldFill?.sourceHash,hash(source));
 assert.equal(packet.memory,'');assert.deepEqual(packet.history,[]);assert.equal(packet.artworkDestinations,undefined);assert.equal(packet.editorContext,undefined);assert.deepEqual(task.builderNotes,[]);
 const running=reduce(project,{type:'taskRunning',taskId:'fill',attempt:'one'});
 for(const command of [{type:'taskEdit',action:'replace',path:['description'],source:'"bad"'},{type:'proposeArtwork',id:'bad',request:{}},{type:'proposeWorkOrder',id:'bad',order:{}}])assert.throws(()=>reduce(running,{...command,taskId:'fill',attempt:'one'}));
 const completed=reduce(running,{type:'taskDone',taskId:'fill',attempt:'one',text:JSON.stringify(result)});
 assert.deepEqual(completed.tasks[0].fieldFill?.result,result);assert.equal(completed.tasks[0].state,'COMPLETED');assert.equal(completed.activeSource,project.activeSource);assert.deepEqual(completed.chat,project.chat);assert.deepEqual(completed.candidates,[]);
 assert.equal(running.tasks[0].fieldFill?.result,undefined);
 assert.throws(()=>reduce(running,{type:'taskDone',taskId:'fill',text:JSON.stringify([{path:['title'],value:'Bad'}])}));
 const draft={...create('p','World',source,1),draft:{path:['title'],text:'"Draft"',baseHash:hash(source)}};
 const draftTask=reduce(draft,{type:'prepareTask',id:'fill',kind:'plan',fieldFill:input});assert.deepEqual(draftTask.draft,draft.draft);
 const done=reduce(reduce(draftTask,{type:'taskRunning',taskId:'fill'}),{type:'taskDone',taskId:'fill',text:'[]'});assert.deepEqual(done.draft,draft.draft);
});

test('field fill rejects mixed tasks and late completions after cancellation or stale attempts',()=>{
 for(const extra of [{kind:'work'},{grading:{}},{addressNotes:true}])assert.throws(()=>reduce(create('p','World',source,1),{type:'prepareTask',kind:'plan',fieldFill:input,...extra}));
 const running=reduce(prepared(),{type:'taskRunning',taskId:'fill',attempt:'one'}),stopped=reduce(running,{type:'taskStop',taskId:'fill',state:'CANCELED'});
 assert.throws(()=>reduce(stopped,{type:'taskDone',taskId:'fill',text:JSON.stringify(result)}),/no longer running/);
 assert.throws(()=>reduce(running,{type:'taskDone',taskId:'fill',attempt:'old',text:'[]'}),/no longer exists/);
 assert.equal(stopped.tasks[0].fieldFill?.result,undefined);
});

test('all API protocols and harnesses use distinct field fill prompt and read-only tools',()=>{
 const project=prepared(),messages=[{role:'user' as const,text:JSON.stringify(assistantPacket(project,project.tasks[0]))}],expected=['world_read','world_children','world_search','world_validate','world_schema'];
 assert.deepEqual(toolDefinitions(false,false,true).map(tool=>tool.name),expected);assert.match(agentSystem(false,false,true),/field filler/);assert.doesNotMatch(agentSystem(false,false,true),/design assessor/);
 for(const protocol of ['openai','openai-responses','anthropic','gemini'] as const){const route:TaskRoute={id:'fixture',name:'Fixture',protocol,baseUrl:'https://example.com/v1',model:'fixture',stage:'planning'},body=JSON.parse(apiRequest(route,'',messages,false).body),definitions=protocol==='gemini'?body.tools[0].functionDeclarations:body.tools;assert.deepEqual(definitions.map((tool:any)=>tool.function?.name||tool.name),expected);assert.match(JSON.stringify(body),/read-only Voyage prose field filler/);}
 const harness=JSON.parse(harnessInput(messages,false));assert.match(harness.system,/field filler/);assert.deepEqual(harness.tools.map((tool:any)=>tool.name),expected);
});
