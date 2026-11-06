import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import type {Rpc} from './codex';
import {defaultSettings} from '../../packages/core/providers';

test('Codex CLI import-summary route advertises only the frozen review reader and never applies the import',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-import-summary-')),service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 const source='{"shortId":"WORLD","initialGameState":{"heroesVersion":37,"triggerDefinitions":{"One":{"instructions":"Before"}},"parties":{"":{"entities":{"Ada":{"hp":17}}}}}}';
 let ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});const calls:{method:string;params:any}[]=[];
 const rpc={onEvent:(_method:string,_params:any)=>{},onTool:async(_name:string,_args:any,_id?:string):Promise<any>=>null,closed:0,init:async()=>{},close(){this.closed++;},async request(method:string,params:any){calls.push({method,params});if(method==='account/read')return {account:{type:'chatgpt'}};if(method==='thread/start')return {thread:{id:'thread'}};if(method==='turn/start')ready();return {};}};
 try{
  const settings=defaultSettings();settings.routes.planning={profileId:'codex',model:'selected-cli-model'};await service.request('saveProviderSettings',{settings});
  const project=service.store.create('Import summary',source).project!;service.store.dispatch(project.id,{type:'stage',id:'import',kind:'import',title:'Import',source:'{"heroesVersion":37,"triggerDefinitions":{"One":{"instructions":"After"}}}'});
  service.agent.createRpc=()=>rpc as unknown as Rpc;
  const result=await service.request('startAgent',{id:project.id,kind:'plan',importReview:{candidateId:'import'},includeBuilderNotes:false});await started;
  const thread=calls.find(call=>call.method==='thread/start')!.params;assert.equal(thread.model,'selected-cli-model');assert.deepEqual(thread.dynamicTools.map((tool:any)=>tool.name),['world_import_review']);assert.equal(thread.sandbox,'read-only');assert.deepEqual(thread.environments,[]);
  const packet=JSON.parse(calls.find(call=>call.method==='turn/start')!.params.input[0].text);assert.equal(packet.role,'read-only-import-summary');assert.equal(packet.importReview.candidateId,'import');assert.equal(JSON.stringify(packet).includes('"hp"'),false);
  const page=await rpc.onTool('world_import_review',{offset:0},'read');assert.equal(page.counts.world,1);assert.equal(page.omittedKept,1);assert.equal(page.nextOffset,null);
  rpc.onEvent('item/agentMessage/delta',{delta:'One trigger instruction changes from Before to After. Omitted party state is kept.'});rpc.onEvent('turn/completed',{turn:{status:'completed'}});
  await service.orchestrator.running.get(project.id+':'+result.project.tasks[0].id);
  const saved=service.store.project(project.id);assert.equal(saved.tasks[0].state,'COMPLETED',saved.tasks[0].error);assert.equal(saved.activeSource,source);assert.equal(saved.candidates.length,1);assert.equal(saved.remote.operations.length,0);assert.equal(saved.workOrderProposals?.length||0,0);assert.equal(saved.chat.length,0);assert.equal(rpc.closed,1);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
