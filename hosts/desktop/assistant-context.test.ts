import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from './service';
import {defaultSettings} from '../../packages/core/providers';

test('planning sends current editor focus and retains earlier conversation across editors',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-assistant-'));
 const bodies:any[]=[];
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  bodies.push(JSON.parse(raw));
  response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({choices:[{message:{content:'Consider a stronger motivation.'},finish_reason:'stop'}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 async function finished(id:string){
  for(let attempt=0;attempt<200;attempt++){
   const project=service.store.project(id);
   if(!['PREPARED','RUNNING'].includes(project.tasks[0].state)){assert.equal(project.tasks[0].state,'COMPLETED');return project;}
   await new Promise(resolve=>setTimeout(resolve,15));
  }
  throw new Error('Assistant did not finish');
 }
 try{
  const settings=defaultSettings();
  settings.profiles.push({id:'mock',name:'Mock assistant',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'test'});
  settings.routes.planning={profileId:'mock',model:'test'};
  await service.request('saveProviderSettings',{settings});
  const source='{"initialGameState":{"npcs":{"mara":{"name":"Mara","exact":9007199254740993}},"regions":{"coast":{"name":"The Coast"}}}}';
  const {project}=await service.request('create',{name:'Context fixture',source});
  const focus={screen:'characters',path:['initialGameState','npcs','mara'],label:'Mara',hasUnappliedEdits:true};
  await service.request('startAgent',{id:project.id,kind:'plan',prompt:'How can we improve this?',editorContext:focus});
  focus.label='Changed';focus.path[2]='other';
  await finished(project.id);
  const first=JSON.parse(bodies[0].messages.find((message:any)=>message.role==='user').content);
  assert.equal(first.editorContext.label,'Mara');
  assert.match(first.editorContext.excerpts[0].source,/9007199254740993/);
  assert.equal(first.editorContext.hasUnappliedEdits,true);
  assert.ok(!bodies[0].tools.some((tool:any)=>tool.function.name==='world_edit'));
  await service.request('startAgent',{id:project.id,kind:'plan',prompt:'And this?',editorContext:{screen:'map',section:'regions',key:'coast',label:'The Coast'}});
  const saved=await finished(project.id);
  const second=JSON.parse(bodies[1].messages.find((message:any)=>message.role==='user').content);
  assert.equal(second.editorContext.label,'The Coast');
  assert.deepEqual(second.editorContext.focusPaths,[['initialGameState','regions','coast']]);
  assert.equal(second.history[0].editorContext.label,'Mara');
  assert.ok(second.history.some((entry:any)=>entry.role==='assistant'&&entry.text.includes('motivation')));
  assert.equal(saved.activeSource,source);
 }finally{server.close();service.store.close();rmSync(directory,{recursive:true,force:true});}
});
