import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {defaultSettings} from '../../packages/core/providers';

test('HTTP planner creates durable artwork requests without image calls or portrait edits',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-artwork-proposals-'));let calls=0;
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  const body=JSON.parse(raw);
  assert.equal(request.url,'/chat/completions');
  assert.ok(body.tools.some((tool:any)=>tool.function.name==='propose_artwork'));
  const packet=JSON.parse(body.messages[1].content),target=packet.artworkDestinations.find((item:any)=>item.label==='Guide'&&!item.hasArtwork);
  const message=++calls===1?{tool_calls:[{id:'artwork',type:'function',function:{name:'propose_artwork',arguments:JSON.stringify({destinationId:target.id,prompt:'Watercolor lighthouse keeper, preserve the world style.'})}}]}:{content:'Review the artwork request, then approve generation in Artwork.'};
  if(calls===2){const result=JSON.parse(body.messages.at(-1).content);assert.equal(result.generated,false);assert.equal(result.awaitingHumanApproval,true);assert.equal(result.activeWorldUnchanged,true);}
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Local test',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.planning={profileId:'fixture',model:''};
  await service.request('saveProviderSettings',{settings});
  const source='{"npcs":{"guide":{"name":"Guide"},"malo":{"name":"Mal0","portraitUrl":"https://images.example/malo.png"}}}',project=(await service.request('create',{name:'Artwork planner fixture',source})).project;
  await service.request('startAgent',{id:project.id,kind:'plan',prompt:'Generate missing portraits'});
  for(let attempt=0;attempt<200&&['PREPARED','RUNNING'].includes(service.store.project(project.id).tasks[0].state);attempt++)await new Promise(resolve=>setTimeout(resolve,15));
  const saved=service.store.project(project.id);
  assert.equal(saved.tasks[0].state,'COMPLETED');assert.equal(saved.activeSource,source);assert.equal(saved.candidates.length,0);assert.equal(saved.artworkProposals?.length,1);assert.equal(saved.artworkProposals?.[0].label,'Guide');assert.equal(calls,2);
 }finally{service.store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));rmSync(directory,{recursive:true,force:true});}
});
