import assert from 'node:assert/strict';
import test from 'node:test';
import {create,reduce,hash} from './project';
import {assistantPacket} from './assistant-context';
import {apiRequest,toolDefinitions,agentSystem,type TaskRoute} from './providers';
import {harnessInput} from './harness';

const selection={path:'universal',overlay:'standard',rationale:'Use the cross-genre anchor before assigning any grades.'};
const source='{"title":"A World","storyStarts":{"start":{"text":"Open the gate."}}}';
function prepared(){
 const project=create('project','World',source,1);
 project.chat=[{role:'user',text:'Unrelated planning history'}];
 project.memory='Unrelated assistant memory';
 return reduce(project,{type:'prepareTask',id:'grade',attempt:'attempt',kind:'plan',grading:selection,now:2});
}

test('grading freezes rubric and source while excluding chat, memory, artwork and builder notes',()=>{
 const project=prepared(),task=project.tasks[0],packet=assistantPacket(project,task);
 assert.equal(task.kind,'plan');assert.equal(task.baseSource,source);assert.equal(task.baseHash,hash(source));
 assert.equal(task.grading?.rubric.version,'1.6');assert.equal(project.chat.length,1);
 assert.deepEqual(task.builderNotes,[]);assert.deepEqual(packet.history,[]);assert.equal(packet.memory,'');
 assert.equal(packet.artworkDestinations,undefined);assert.equal(packet.grading?.sourceHash,hash(source));
 assert.match(task.prompt,/JSON/);
});

test('grading uses read-only tools for direct APIs, Codex and CLI harnesses',()=>{
 const project=prepared(),packet=assistantPacket(project,project.tasks[0]);
 const expected=['world_read','world_children','world_search','world_validate','world_schema'];
 assert.deepEqual(toolDefinitions(false,true).map(tool=>tool.name),expected);
 assert.match(agentSystem(false,true),/read-only/);
 const messages=[{role:'user' as const,text:JSON.stringify(packet)}];
 for(const protocol of ['openai','openai-responses','anthropic','gemini'] as const){
  const route:TaskRoute={id:'fixture',name:'Fixture',protocol,baseUrl:'https://example.com/v1',model:'fixture',stage:'planning'};
  const body=JSON.parse(apiRequest(route,'',messages,false).body);
  const definitions=protocol==='gemini'?body.tools[0].functionDeclarations:body.tools;
  assert.deepEqual(definitions.map((tool:any)=>tool.function?.name||tool.name),expected);
 }
 const harness=JSON.parse(harnessInput(messages,false));
 assert.deepEqual(harness.tools.map((tool:any)=>tool.name),expected);
 assert.match(harness.system,/read-only/);
});

test('grading cannot edit worlds or create proposals through hidden tool calls',()=>{
 const project=reduce(prepared(),{type:'taskRunning',taskId:'grade',attempt:'attempt'});
 const task={taskId:'grade',attempt:'attempt',id:'proposal'};
 assert.throws(()=>reduce(project,{...task,type:'taskEdit',action:'replace',path:['title'],source:'"Changed"'}),/cannot edit/);
 assert.throws(()=>reduce(project,{...task,type:'proposeWorkOrder',order:{objective:'Change it',requirements:[],allowedPaths:[['title']]}}),/Grading is read only/);
 assert.throws(()=>reduce(project,{...task,type:'proposeArtwork',request:{}}),/Grading is read only/);
 assert.equal(project.activeSource,source);assert.equal(project.candidates.length,0);assert.equal(project.workOrderProposals,undefined);
});

test('rubric updates and grading enforce explicit task and draft boundaries',()=>{
 assert.throws(()=>reduce(prepared(),{type:'gradingRubric'}),/Stop or finish/);
 const project=create('project','World',source,1);
 project.draft={path:['title'],text:'"Draft"',baseHash:hash(source)};
 assert.throws(()=>reduce(project,{type:'prepareTask',id:'grade',attempt:'attempt',kind:'plan',grading:selection}),/unapplied edits/);
 assert.throws(()=>reduce(create('p','World',source,1),{type:'prepareTask',kind:'work',grading:selection}),/read-only planning/);
 const updated=reduce(create('p','World',source,1),{type:'gradingRubric'});
 assert.deepEqual(updated.grading?.reports,[]);assert.equal(updated.activeSource,source);
});

test('cancelled grading rejects late results without altering previous reports or chat',()=>{
 const project=reduce(prepared(),{type:'taskRunning',taskId:'grade',attempt:'attempt'});
 const stopped=reduce(project,{type:'taskStop',taskId:'grade',attempt:'attempt',state:'CANCELED'});
 assert.throws(()=>reduce(stopped,{type:'taskDone',taskId:'grade',attempt:'attempt',text:'{}'}),/no longer running/);
 assert.equal(stopped.activeSource,source);assert.equal(stopped.chat.length,1);
 assert.equal(stopped.grading?.reports.length||0,0);
});
