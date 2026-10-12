import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Service} from './service';
import {hash} from '../../packages/core/project';
import {diff} from '../../packages/core/document';
test('applied note outcomes use transactional checkpoint comparisons and reflect selective acceptance',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-note-changes-'));let service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
 try{
  const source='{"system":{"first":1,"second":9007199254740993}}',project=(await service.request('create',{name:'Note outcome fixture',source})).project,id=project.id;
  const dispatch=(command:any)=>service.store.dispatch(id,command);
  dispatch({type:'builderNote',baseHash:hash(source),note:{id:'note',path:['system'],text:'Improve system',planning:true}});
  dispatch({type:'prepareTask',kind:'plan',id:'plan',attempt:'p',addressNotes:true});dispatch({type:'taskRunning',taskId:'plan',attempt:'p'});
  dispatch({type:'proposeWorkOrder',taskId:'plan',attempt:'p',id:'suggestion',order:{objective:'Improve system',requirements:[],allowedPaths:[['system']]}});
  dispatch({type:'recordNotePlan',taskId:'plan',attempt:'p',noteId:'note',state:'proposed',explanation:'Suggested',proposalId:'suggestion'});dispatch({type:'taskDone',taskId:'plan',attempt:'p'});
  dispatch({type:'workOrder',order:{objective:'Improve system',requirements:[],allowedPaths:[['system']],sourceProposalId:'suggestion'}});
  dispatch({type:'prepareTask',kind:'work',id:'work',attempt:'w'});dispatch({type:'taskRunning',taskId:'work',attempt:'w'});
  dispatch({type:'taskEdit',taskId:'work',attempt:'w',path:['system','first'],source:'2'});dispatch({type:'taskEdit',taskId:'work',attempt:'w',path:['system','second'],source:'3'});dispatch({type:'taskDone',taskId:'work',attempt:'w'});
  dispatch({type:'candidateChange',id:'work',candidateHash:hash(service.store.project(id).candidates[0].source),path:['system','second'],kind:'changed',reject:true});dispatch({type:'accept',id:'work'});
  const detail=await service.request('noteChangeDetail',{id,receiptId:'work'});assert.equal(detail.before,source);assert.equal(detail.after,'{"system":{"first":2,"second":9007199254740993}}');assert.equal(diff(detail.before,detail.after).total,1);assert.equal(service.store.history(id).length,2);
  const other=(await service.request('create',{name:'Other',source:'{}'})).project;await assert.rejects(()=>service.request('noteChangeDetail',{id:other.id,receiptId:'work'}),/not found/);
  dispatch({type:'edit',baseHash:hash(detail.after),path:['system','first'],source:'4'});assert.equal((await service.request('noteChangeDetail',{id,receiptId:'work'})).after,detail.after);
  service.store.close();service=new Service(directory,path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});assert.equal((await service.request('noteChangeDetail',{id,receiptId:'work'})).before,source);
 }finally{service.store.close();rmSync(directory,{recursive:true,force:true});}
});
