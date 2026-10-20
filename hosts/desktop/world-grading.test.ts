import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from './service';
import {Store} from './store';
import {defaultSettings} from '../../packages/core/providers';
import {bundledRubric} from '../../packages/core/world-grading';
import {hash} from '../../packages/core/project';

const selection={path:'universal',overlay:'standard',rationale:'Precommitted cross-genre assessment.'};
const source='{"title":"Test world","storyStarts":{"opening":"Open the gate."}}';
function fixtureReport(){return {
 summary:'The source is an early draft; required design evidence is missing.',strengths:['A concrete opening is named.'],
 criteria:bundledRubric.criteria.map(criterion=>({id:criterion.id,grade:'NE',feedback:'Required source evidence for '+criterion.id+' is incomplete.',evidence:[],improvement:'Specify and trace this design before grading it.'})),
 gates:bundledRubric.gates.map(gate=>({id:gate.id,status:'NE',explanation:'Insufficient source evidence for a complete gate review.'})),
 diagnostics:Object.fromEntries(['cover','title','blurb','storyStart','characterCreator'].map(key=>[key,{score:'NE',explanation:'Required diagnostic evidence is not fully supplied.'}])),
 fixes:[{id:'opening',criterionIds:['A1'],priority:'high',title:'Make the opening actionable',why:'The opening needs an explicit decision and consequence.',requirements:['Name the immediately usable affordance and consequence.'],allowedPaths:[['storyStarts']]}],
 missingEvidence:['Cover pixels and complete design contracts are missing.'],promises:['Open the gate.'],intent:'Original world; ownership is not independently verified.'
};}

test('grading persists a separate report and optional fixes remain unapproved suggestions',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-world-grading-'));let calls=0;
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);calls++;
  const tools=body.tools.map((tool:any)=>tool.function.name);
  assert(!tools.includes('world_edit'));assert(!tools.includes('propose_work_order'));assert(!tools.includes('propose_artwork'));
  const packet=JSON.parse(body.messages.find((message:any)=>message.role==='user').content);
  assert.equal(packet.grading.rubricVersion,'1.6');assert.equal(packet.grading.sourceHash,hash(source));assert.deepEqual(packet.history,[]);
  response.setHeader('Content-Type','application/json');
  const message=calls===1?{tool_calls:[{id:'forbidden',type:'function',function:{name:'propose_work_order',arguments:JSON.stringify({objective:'Forbidden',requirements:[],allowedPaths:[['title']]})}}]}:{content:JSON.stringify(fixtureReport())};
  if(calls===2)assert.match(body.messages.at(-1).content,/unavailable/);
  response.end(JSON.stringify({choices:[{message}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Fixture',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.planning={profileId:'fixture',model:''};
  await service.request('saveProviderSettings',{settings});
  const project=(await service.request('create',{name:'Grading fixture',source})).project;
  await service.request('startAgent',{id:project.id,kind:'plan',grading:selection});
  for(let attempt=0;attempt<200&&['PREPARED','RUNNING'].includes(service.store.project(project.id).tasks[0].state);attempt++)await new Promise(resolve=>setTimeout(resolve,15));
  const saved=service.store.project(project.id);
  assert.equal(saved.tasks[0].state,'COMPLETED',saved.tasks[0].error);assert.equal(saved.activeSource,source);assert.equal(saved.chat.length,0);
  assert.equal(saved.grading?.reports.length,1);assert.equal(saved.candidates.length,0);assert.equal(saved.workOrderProposals,undefined);
  const report=saved.grading!.reports[0];assert.equal(report.scores.universal.lower,0);assert.equal(report.scores.universal.upper,100);
  service.store.dispatch(project.id,{type:'gradingFixOrder',reportId:report.id,fixId:'opening',id:'suggestion',baseHash:hash(source)});
  const suggested=service.store.project(project.id);assert.equal(suggested.workOrderProposals?.length,1);assert.equal(suggested.workOrder.objective,'');assert.equal(suggested.tasks.length,1);assert.equal(suggested.activeSource,source);
  service.store.dispatch(project.id,{type:'edit',path:['title'],source:'"Changed world"',baseHash:hash(source)});
  assert.throws(()=>service.store.dispatch(project.id,{type:'gradingFixOrder',reportId:report.id,fixId:'opening',id:'stale',baseHash:hash(service.store.project(project.id).activeSource)}),/world changed/);
  const reopened=new Store(directory);try{assert.equal(reopened.project(project.id).grading?.reports[0].sourceHash,hash(source));}finally{reopened.close();}
 }finally{service.store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});

test('malformed grading completion fails safely and preserves earlier reports',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-world-grading-failure-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const project=(await service.request('create',{name:'Grading fixture',source})).project;
  service.store.dispatch(project.id,{type:'prepareTask',id:'first',attempt:'one',kind:'plan',grading:selection});
  service.store.dispatch(project.id,{type:'taskRunning',taskId:'first',attempt:'one'});
  service.store.dispatch(project.id,{type:'taskDone',taskId:'first',attempt:'one',text:JSON.stringify(fixtureReport())});
  service.store.dispatch(project.id,{type:'prepareTask',id:'retry',attempt:'two',kind:'plan',grading:selection});
  service.store.dispatch(project.id,{type:'taskRunning',taskId:'retry',attempt:'two'});
  assert.throws(()=>service.store.dispatch(project.id,{type:'taskDone',taskId:'retry',attempt:'two',text:'The world is perfect. 100/100!'}));
  service.store.dispatch(project.id,{type:'taskStop',taskId:'retry',attempt:'two',state:'FAILED',error:'Invalid grading report'});
  const saved=service.store.project(project.id);assert.equal(saved.grading?.reports.length,1);assert.equal(saved.tasks[0].state,'FAILED');assert.equal(saved.chat.length,0);assert.equal(saved.activeSource,source);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
