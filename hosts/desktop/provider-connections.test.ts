import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {Service} from './service';
import {defaultSettings,type Protocol} from '../../packages/core/providers';

const presets:[string,Protocol][]=[['OpenAI','openai-responses'],['Local endpoint','openai'],['xAI','openai'],['OpenRouter','openai'],['Anthropic','anthropic'],['Gemini','gemini']];
test('Codex discovery uses its app-server catalog without changing routes or probing inference',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-models-'));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const settings=defaultSettings();
  const profile=settings.profiles.find(profile=>profile.protocol==='codex')!;
  settings.routes.planning={profileId:profile.id,model:'saved-custom-model'};
  await service.request('saveProviderSettings',{settings});
  service.agent.models=async()=>[{id:'sol-fixture',name:'Sol'},{id:'luna-fixture',name:'Luna'}];
  assert.deepEqual(await service.request('providerModels',{profileId:profile.id}),[{id:'sol-fixture',name:'Sol'},{id:'luna-fixture',name:'Luna'}]);
  assert.equal(service.providerSettings().routes.planning.model,'saved-custom-model');
 }finally{service.store.db.close();rmSync(directory,{recursive:true,force:true});}
});
for(const [name,protocol] of presets)test(name+' connects, discovers models, probes, and stages exact edits',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-connect-'));
 const credentials:Record<string,string>={};
 const requests:any[]=[];
 let turn=0;
 const response=(text:string,edit=false)=>{
  const args={action:'replace',path:['title'],source:'"Connected"'};
  if(protocol==='openai-responses')return {status:'completed',output:edit?[{type:'reasoning',id:'reason',encrypted_content:'encrypted',summary:[]},{type:'function_call',id:'function',call_id:'edit',name:'world_edit',arguments:JSON.stringify(args)}]:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]};
  if(protocol==='anthropic')return {content:edit?[{type:'tool_use',id:'edit',name:'world_edit',input:args}]:[{type:'text',text}],stop_reason:edit?'tool_use':'end_turn'};
  if(protocol==='gemini')return {candidates:[{finishReason:'STOP',content:{parts:edit?[{functionCall:{id:'edit',name:'world_edit',args},thoughtSignature:'signature'}]:[{text}]}}]};
  return {choices:[{finish_reason:edit?'tool_calls':'stop',message:edit?{tool_calls:[{id:'edit',type:'function',function:{name:'world_edit',arguments:JSON.stringify(args)}}]}:{content:text}}]};
 };
 const server=createServer(async(request,result)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  result.setHeader('Content-Type','application/json');
  requests.push({url:request.url,headers:request.headers,body:raw?JSON.parse(raw):null});
  if(request.method==='GET'){result.end(JSON.stringify(protocol==='gemini'?{models:[{name:'models/test-model'}]}:{data:[{id:'test-model'}]}));return;}
  const body=JSON.parse(raw);
  if(!body.tools){result.end(JSON.stringify(response('OK')));return;}
  const editing=raw.includes('world_edit');
  if(editing&&turn++===0){result.end(JSON.stringify(response('',true)));return;}
  if(editing){assert.match(raw,/edit/);if(protocol==='gemini')assert.match(raw,/signature/);if(protocol==='openai-responses'){assert.match(raw,/encrypted/);assert.match(raw,/function_call_output/);}}
  result.end(JSON.stringify(response('Done')));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:key=>credentials[key]||'',set:(key,value)=>{credentials[key]=value;}});
 try{
  const settings=defaultSettings();
  settings.profiles.push({id:'provider',name,protocol,baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:''});
  settings.routes.planning={profileId:'provider',model:'test-model'};
  settings.routes.building={profileId:'provider',model:'test-model'};
  await service.request('saveProviderSettings',{settings});
  await service.request('providerKey',{profileId:'provider',key:'test-secret'});
  assert.deepEqual(await service.request('providerModels',{profileId:'provider'}),[{id:'test-model',name:'test-model'}]);
  assert.equal((await service.request('providerTest',{profileId:'provider'})).ok,true);
  const source='{"title":"Original","exact":9007199254740993,"fraction":1.000}';
  const {project}=await service.request('create',{name,source});
  const wait=async()=>{for(let attempt=0;attempt<200;attempt++){const current=service.store.project(project.id);if(!['PREPARED','RUNNING'].includes(current.tasks[0].state))return current;await new Promise(resolve=>setTimeout(resolve,15));}throw new Error('Task timed out');};
  await service.request('startAgent',{id:project.id,kind:'plan',prompt:'Discuss title'});
  assert.equal((await wait()).tasks[0].state,'COMPLETED');
  await service.request('command',{id:project.id,command:{type:'workOrder',order:{objective:'Change title',requirements:[],allowedPaths:[['title']]}}});
  await service.request('startAgent',{id:project.id,kind:'work'});
  const result=await wait();
  assert.equal(result.tasks[0].state,'PROPOSAL_READY',result.tasks[0].error);
  assert.equal(result.activeSource,source);
  assert.equal(result.candidates[0].source,source.replace('Original','Connected'));
  assert.equal(result.tasks[0].route?.model,'test-model');
  const header=protocol==='anthropic'?'x-api-key':protocol==='gemini'?'x-goog-api-key':'authorization';
  for(const request of requests)assert.equal(request.headers[header],protocol.startsWith('openai')?'Bearer test-secret':'test-secret');
  assert(!JSON.stringify(service.store.project(project.id)).includes('test-secret'));
  assert(!requests.some(request=>JSON.stringify(request.body).includes('test-secret')));
 }finally{service.store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});
