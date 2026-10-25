import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';

test('malformed tool JSON gets a bounded corrective turn without reexecuting previous calls',async()=>{
 for(const enabled of [true,false]){
  const directory=mkdtempSync(path.join(tmpdir(),'voyage-recovery-arguments-')),previous=globalThis.fetch;
  const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
  let requests=0,reads=0;
  try{
   const project=service.store.create('Arguments','{"title":"Original"}').project!;
   service.store.dispatch(project.id,{type:'prepareTask',id:'task',attempt:'one',kind:'plan',assistantRecovery:{enabled,maxAttempts:1},route:{id:'fixture',name:'Fixture',protocol:'openai',baseUrl:'https://example.invalid/v1',model:'fixture'}});
   const tool=service.providers.tool.bind(service.providers);
   service.providers.tool=(projectId,taskId,name,args)=>{if(args?.path?.[0]==='title')reads++;return tool(projectId,taskId,name,args);};
   globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(String(options?.body));requests++;
    if(requests===1)return new Response(JSON.stringify({choices:[{message:{tool_calls:[{id:'valid',function:{name:'world_read',arguments:'{"path":["title"]}'}},{id:'bad',function:{name:'world_read',arguments:'{"path":['}}]}}]}));
    assert.equal(requests,2);
    const results=body.messages.filter((message:any)=>message.role==='tool');
    assert.equal(results.length,2);assert.equal(JSON.parse(results[1].content).recovery.attempt,1);
    assert.match(results[1].content,/Correct the tool argument JSON/);
    assert.equal(body.messages.find((message:any)=>message.tool_calls)?.tool_calls[1].function.arguments,'{"path":[');
    return new Response(JSON.stringify({choices:[{message:{content:'Corrected response'}}]}));
   };
   await service.providers.run(project.id,'task');
   const saved=service.store.project(project.id);
   assert.equal(saved.tasks[0].state,enabled?'COMPLETED':'FAILED',saved.tasks[0].error);
   assert.equal(requests,enabled?2:1);assert.equal(reads,1);assert.equal(saved.activeSource,'{"title":"Original"}');
  }finally{globalThis.fetch=previous;service.store.close();rmSync(directory,{recursive:true,force:true});}
 }
});
