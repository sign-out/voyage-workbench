import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {hash} from '../../packages/core/project';
import {Service} from './service';
import {dispatchWorldTool} from './world-tools';
import {defaultSettings} from '../../packages/core/providers';
import {createServer} from 'node:http';
import {artworkDestinations} from '../../packages/core/artwork';

const resources=path.resolve('apps/workbench/public/references'),secrets={durable:false,get:()=>'',set:()=>{}};
function prepare(service:Service,source='{"heroesVersion":37,"value":1}',kind='work'){
 const project=service.store.create('Harness',source).project!;
 if(kind==='work')service.store.dispatch(project.id,{type:'workOrder',baseHash:hash(project.activeSource),order:{reviewedScope:true,objective:'Change value',requirements:[],allowedPaths:[['value']]}});
 service.store.dispatch(project.id,{type:'prepareTask',id:'task',attempt:'attempt',kind,prompt:'Inspect',localEditMode:'automatic'});
 service.store.dispatch(project.id,{type:'taskRunning',taskId:'task',attempt:'attempt'});return project.id;
}

test('SQLite commits tool effects and receipts together and replays persisted calls after restart',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-tool-receipts-'));let service=new Service(directory,resources,secrets);
 try{
  const id=prepare(service),call=()=>dispatchWorldTool(service.store,id,'task','attempt','edit','world_edit',{action:'replace',path:['value'],source:'2'});
  service.store.db.exec("CREATE TRIGGER reject_tool_write BEFORE UPDATE ON projects BEGIN SELECT RAISE(FAIL, 'Disk unavailable'); END");
  assert.throws(call,/Disk unavailable/);assert.equal(service.store.project(id).tasks[0].toolJournal,undefined);assert.match(service.store.project(id).tasks[0].stagedSource,/"value":1/);
  service.store.db.exec('DROP TRIGGER reject_tool_write');assert.equal(call().staged,true);
  const snapshot=service.store.project(id);service.store.close();service=new Service(directory,resources,secrets);
  assert.equal(service.store.project(id).tasks[0].state,'INTERRUPTED');
  assert.equal(service.store.project(id).tasks[0].toolJournal!.length,1);
  assert.throws(call,/no longer running/);
  const receipt=service.store.project(id).tasks[0].toolJournal![0];assert.deepEqual(receipt,snapshot.tasks[0].toolJournal![0]);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});

test('host references override untrusted completion inputs and failed schemas retain review proposals',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-completion-gate-')),service=new Service(directory,resources,secrets);
 try{
  const id=prepare(service);service.references=[{section:'heroesVersion',schema:{_type:'literal',value:37}},{section:'value',schema:'number'}];
  dispatchWorldTool(service.store,id,'task','attempt','bad','world_edit',{action:'replace',path:['value'],source:'"wrong type"'});
  const completed=service.store.dispatch(id,{type:'taskDone',taskId:'task',attempt:'attempt',references:[{section:'value',schema:'any'}]}).project!;
  assert.equal(completed.tasks[0].state,'PROPOSAL_READY');assert.equal(completed.tasks[0].completionEvidence!.state,'blocked');assert.match(completed.activeSource,/"value":1/);assert.equal(service.store.history(id).length,0);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});

test('replayed HTTP tool batches stage once and wire IDs are scoped to response turns',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-provider-replay-'));let turn=0;
 const server=createServer(async(request,response)=>{
  for await(const chunk of request)void chunk;
  const edit=(index:number)=>({id:'same-wire-id',type:'function',function:{name:'world_edit',arguments:JSON.stringify({action:'insert',path:['list'],key:index,source:'9007199254740993'})}});
  const message=turn===0?{tool_calls:[edit(0),edit(0)]}:turn===1?{tool_calls:[edit(1)]}:{content:'Done'};turn++;
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify({choices:[{message,finish_reason:'stop'}]}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const service=new Service(directory,resources,secrets);
 try{
  const settings=defaultSettings();settings.profiles.push({id:'fixture',name:'Replay fixture',protocol:'openai',baseUrl:'http://127.0.0.1:'+(server.address() as any).port,model:'fixture'});settings.routes.building={profileId:'fixture',model:''};await service.request('saveProviderSettings',{settings});service.store.setting('localEditMode','proposal-only');
  const project=service.store.create('Replay','{"heroesVersion":37,"list":[]}').project!;
  service.store.dispatch(project.id,{type:'workOrder',baseHash:hash(project.activeSource),order:{reviewedScope:true,objective:'Add two values',requirements:[],allowedPaths:[['list']]}});await service.request('startAgent',{id:project.id,kind:'work'});
  for(let attempt=0;attempt<200&&['PREPARED','RUNNING'].includes(service.store.project(project.id).tasks[0].state);attempt++)await new Promise(resolve=>setTimeout(resolve,15));
  const result=service.store.project(project.id);assert.equal(result.tasks[0].state,'PROPOSAL_READY',result.tasks[0].error);assert.equal(result.tasks[0].toolJournal!.length,2);assert.match(result.candidates[0].source,/9007199254740993,\s*9007199254740993/);assert.equal(result.activeSource,project.activeSource);
 }finally{service.store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});

test('planning artwork stays a separately approved proposal through the shared dispatcher',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-planner-receipt-')),service=new Service(directory,resources,secrets);
 try{
  const source='{"initialGameState":{"npcs":{"guide":{"name":"Guide"}}}}',id=prepare(service,source,'plan'),destinationId=artworkDestinations(source).find(item=>item.label==='Guide')!.id;
  const result=dispatchWorldTool(service.store,id,'task','attempt','art','propose_artwork',{destinationId,prompt:'A misty harbor'});
  assert.equal(result.generated,false);assert.equal(result.awaitingHumanApproval,true);assert.equal(service.store.project(id).artworkProposals!.length,1);
  assert.deepEqual(dispatchWorldTool(service.store,id,'task','attempt','art','propose_artwork',{prompt:'A misty harbor',destinationId}),result);assert.equal(service.store.project(id).artworkProposals!.length,1);
  assert.throws(()=>dispatchWorldTool(service.store,id,'task','attempt','edit','world_edit',{action:'replace',path:[],source:'{}'}),/unavailable/);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
