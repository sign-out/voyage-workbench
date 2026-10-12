import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from './service';
import {defaultSettings} from '../../packages/core/providers';
import {hash} from '../../packages/core/project';
test('flagged-note planning runs its frozen queue through notes, proposal and outcome tools',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-note-queue-'));let calls=0,proposalId='';
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);calls++;
  const call=(name:string,args:any)=>({id:'call-'+calls+'-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}});
  let message:any;
  if(calls===1){const input=body.messages.find((message:any)=>message.role==='user').content;assert.match(input,/BEGIN BUILDER NOTE QUEUE/);assert.match(input,/Deepen combat/);assert.match(input,/Rewrite background/);message={tool_calls:[call('world_notes',{path:[]})]};}
  else if(calls===2){assert.equal(JSON.parse(body.messages.at(-1).content).notes.length,2);message={tool_calls:[call('propose_work_order',{objective:'Improve the world',requirements:['Preserve exact numbers'],allowedPaths:[['combatSettings'],['character']]})]};}
  else if(calls===3){proposalId=JSON.parse(body.messages.at(-1).content).proposalId;message={tool_calls:['combat-note','character-note'].map(noteId=>call('record_note_plan',{noteId,state:'proposed',explanation:'Included in the scoped suggestion',proposalId}))};}
  else message={content:'Both notes have scoped suggestions awaiting review.'};
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Local test',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.planning={profileId:'fixture',model:''};await service.request('saveProviderSettings',{settings});
  const source='{"combatSettings":{},"character":{"exact":9007199254740993}}',project=(await service.request('create',{name:'Note queue fixture',source})).project;
  for(const [id,path,text] of [['combat-note',['combatSettings'],'Deepen combat'],['character-note',['character'],'Rewrite background']] as const)service.store.dispatch(project.id,{type:'builderNote',baseHash:hash(source),note:{id,path,text,planning:true}});
  await service.request('startAgent',{id:project.id,kind:'plan',addressNotes:true});
  for(let attempt=0;attempt<200&&['PREPARED','RUNNING'].includes(service.store.project(project.id).tasks[0].state);attempt++)await new Promise(resolve=>setTimeout(resolve,15));
  const saved=service.store.project(project.id);assert.equal(saved.tasks[0].state,'COMPLETED');assert.equal(saved.activeSource,source);assert.equal(saved.workOrder.objective,'');assert.equal(saved.tasks[0].noteQueue?.length,2);assert(saved.tasks[0].noteQueue?.every(item=>item.state==='proposed'&&item.proposalId===proposalId));assert(saved.builderNotes?.every(note=>note.planning));
 }finally{service.store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});
test('HTTP planner persists a structured suggestion and waits for human approval',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-work-order-'));let calls=0;
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw);
  assert(body.tools.some((tool:any)=>tool.function.name==='propose_work_order'));
  assert(!body.tools.some((tool:any)=>tool.function.name==='world_edit'));
  const message=++calls===1?{tool_calls:[{id:'suggest',type:'function',function:{name:'propose_work_order',arguments:JSON.stringify({objective:'Improve title',requirements:['Keep exact numbers'],allowedPaths:[['title']]})}}]}:{content:'Review the suggested Work Order before running it.'};
  if(calls===2){const result=JSON.parse(body.messages.at(-1).content);assert.equal(result.awaitingHumanApproval,true);assert.equal(result.activeWorldUnchanged,true);assert.equal(typeof result.proposalId,'string');}
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Local test',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.planning={profileId:'fixture',model:''};await service.request('saveProviderSettings',{settings});
  const source='{"title":"World","exact":9007199254740993}',project=(await service.request('create',{name:'Planner fixture',source})).project;
  await service.request('startAgent',{id:project.id,kind:'plan',prompt:'Suggest a title improvement'});
  for(let attempt=0;attempt<200&&['PREPARED','RUNNING'].includes(service.store.project(project.id).tasks[0].state);attempt++)await new Promise(resolve=>setTimeout(resolve,15));
  const saved=service.store.project(project.id);assert.equal(saved.tasks[0].state,'COMPLETED');assert.equal(saved.workOrder.objective,'');assert.equal(saved.activeSource,source);assert.equal(saved.candidates.length,0);assert.equal(saved.workOrderProposals?.length,1);
  assert.deepEqual(saved.workOrderProposals?.[0].order.allowedPaths,[['title']]);
 }finally{service.store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});
