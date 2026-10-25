import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create,hash} from '../../../packages/core/project';
import {publicationAction,publicationCooldown,createWorldCopy,valid,validateSource,type PublicationOperation} from './features-api';
import {PublicationJournal} from './FeatureViews';

function fixture(){
 const source='{"shortId":"WORLD","title":"World","initialGameState":{"heroesVersion":37,"parties":{"main":{"quests":{}}},"exact":90071992547409931234}}';
 const project=create('publication-test','World',source,Date.now());
 project.remote={worldId:'WORLD',etag:'"revision"',baselineHash:hash(source),environment:'alpha',operations:[]};
 const connection={environment:'alpha',apiBase:'https://api-alpha.aidungeon.com/creator/v1'};
 const store=new Map<string,string>(),calls:{method:string;payload:any}[]=[],posts:any[]=[];
 let postFailure='',readFailure='',afterPostReadFailure='',responseText='{}',remoteSource=source,remoteEtag='"revision"',checkpoint:()=>void=()=>{},beforeWrite:((payload:any)=>void)|undefined;
 const previous=(globalThis as any).window;
 (globalThis as any).window={voyage:{invoke:async(method:string,payload:any={})=>{
  calls.push({method,payload});
  if(method==='project')return {project:structuredClone(project)};
  if(method==='connection')return {...connection};
  if(method==='featureGet')return store.get(payload.key)??null;
  if(method==='featureSet'){
   beforeWrite?.(payload);
   if(payload.expected!==(store.get(payload.key)??null))throw new Error('This feature changed. Reload before continuing.');
   store.set(payload.key,payload.value);return {};
  }
  if(method==='checkpoint'){checkpoint();return [];}
  if(method==='downloadWorld')return {project:structuredClone(project)};
  if(method==='creatorRequest'){
   if(payload.endpoint==='/validate')return {text:'{"data":{"valid":true,"errors":[],"warnings":[],"stage":"publish"}}',etag:''};
   if(payload.method==='GET'){
    if(readFailure||posts.length&&afterPostReadFailure)throw new Error(readFailure||afterPostReadFailure);
    return {text:remoteSource,etag:remoteEtag};
   }
   posts.push(structuredClone(payload));assert.equal(rows()[0].state,'SEND_ATTEMPTED');assert.equal(rows()[0].id,payload.idempotencyKey);
   if(postFailure)throw new Error(postFailure);
   return {text:responseText,etag:remoteEtag};
  }
  throw new Error('Unexpected request '+method);
 }}};
 const rows=():PublicationOperation[]=>JSON.parse(store.get('publication:'+project.id)||'[]');
 return {project,connection,calls,posts,store,rows,setPostFailure:(value:string)=>{postFailure=value;},setReadFailure:(value:string)=>{readFailure=value;},setAfterPostReadFailure:(value:string)=>{afterPostReadFailure=value;},setResponse:(value:string)=>{responseText=value;},setRemote:(value:string,etag=remoteEtag)=>{remoteSource=value;remoteEtag=etag;},setCheckpoint:(value:()=>void)=>{checkpoint=value;},setBeforeWrite:(value:(payload:any)=>void)=>{beforeWrite=value;},close:()=>{(globalThis as any).window=previous;}};
}

test('validation requires an affirmative valid result with no errors, never generic success',async()=>{
 for(const report of [{success:true},{success:true,valid:false,errors:[]},{data:{valid:false,errors:[]},valid:true},{data:{valid:true,errors:[{message:'Invalid'}]}},{valid:true},null])assert.equal(valid(report),false);
 assert.equal(valid({data:{valid:true,errors:[],warnings:[]}}),true);
 assert.equal(valid({valid:true,errors:[]}),true);
 const current=fixture();
 try{
  await assert.rejects(validateSource(current.project.activeSource,'unsupported'),/stage must be/);
  assert.equal(current.calls.length,0);
  await validateSource(current.project.activeSource,'publish');
  const body=current.calls[0].payload.body;assert.match(body,/90071992547409931234/);assert.match(body,/"parties"/);
  assert.equal(current.calls[0].payload.idempotencyKey,undefined);
 }finally{current.close();}
});

test('clean rejections are terminal while unknown outcomes retain their key',async()=>{
 for(const [failure,state] of [
  ['Voyage HTTP 400 (invalid_world): Correct this world.','REJECTED'],
  ['Voyage HTTP 401: Reconnect.','REJECTED'],
  ['Voyage HTTP 409 (studio_version_mismatch): Upgrade in Studio.','REJECTED'],
  ['Voyage HTTP 503 (studio_unavailable): Clean availability failure.','RETRYABLE'],
  ['Voyage HTTP 503 (server_error): No side-effect guarantee.','UNKNOWN'],
  ['Voyage HTTP 409 (request_status_unknown): May have completed.','UNKNOWN'],
  ['Voyage HTTP 409 (request_in_progress): Still protected.','UNKNOWN'],
  ['Connection lost after dispatch','UNKNOWN']
 ]){
  const current=fixture();
  try{
   current.setPostFailure(failure);await assert.rejects(publicationAction(current.project,'publish'));
   const operation=current.rows()[0];assert.equal(operation.state,state);assert.equal(operation.environment,'alpha');assert.ok(operation.owner);
   if(state==='REJECTED'){
    await assert.rejects(publicationAction(current.project,'publish',operation),/completed rejection/);
    current.setPostFailure('');await publicationAction(current.project,'publish');assert.notEqual(current.posts[1].idempotencyKey,operation.id);
   }else{
    await assert.rejects(publicationAction(current.project,'unpublish'),/do not create a new key/);
    await assert.rejects(createWorldCopy(current.project),/recorded publication request/);
    current.setPostFailure('');await publicationAction(current.project,'publish',operation);assert.equal(current.posts[1].idempotencyKey,operation.id);
   }
  }finally{current.close();}
 }
});

test('desktop and Android string cooldowns persist and block replay before the deadline',async context=>{
 let now=Date.parse('2026-10-24T12:00:00Z');context.mock.method(Date,'now',()=>now);
 for(const timing of [' Retry no earlier than 2026-10-24T12:01:00.000Z.',' Retry-After: 60. Do not retry before this delay.',' Retry-After: Sat, 24 Oct 2026 12:01:00 GMT. Do not retry before this date.']){
  const current=fixture();
  try{
   current.setPostFailure('Voyage HTTP 429 (moderation_daily_limit): Wait.'+timing);
   await assert.rejects(publicationAction(current.project,'publish'));
   const operation=current.rows()[0];assert.equal(operation.retryAt,Date.parse('2026-10-24T12:01:00Z'));assert.equal(operation.state,'RETRYABLE');
   await assert.rejects(publicationAction(current.project,'publish',{...operation,retryAt:0}),/Retry no earlier/);assert.equal(current.posts.length,1);
   current.setPostFailure('');now=operation.retryAt!;await publicationAction(current.project,'publish',operation);assert.equal(current.posts[1].idempotencyKey,operation.id);
  }finally{current.close();now=Date.parse('2026-10-24T12:00:00Z');}
 }
});

test('only the known Electron workbench wrapper exposes trusted HTTP classification and cooldowns',async context=>{
 const now=Date.parse('2026-10-24T12:00:00Z');context.mock.method(Date,'now',()=>now);
 for(const [failure,state,retryAt] of [
  ["Error invoking remote method 'workbench': Error: Voyage HTTP 400 (invalid_world): Rejected.",'REJECTED',undefined],
  ["Error invoking remote method 'workbench': Error: Voyage HTTP 503 (studio_unavailable): Wait. Retry no earlier than 2026-10-24T12:01:00.000Z.",'RETRYABLE',now+60000],
  ["Error invoking remote method 'workbench': Error: Voyage HTTP 429: Wait. Retry-After: 60.",'RETRYABLE',now+60000],
  ["Error invoking remote method 'workbench': Error: Voyage HTTP 409 (request_in_progress): Wait. Retry-After: 60.",'UNKNOWN',now+60000],
  ["Error invoking remote method 'workbench': Error: Connection lost; Voyage HTTP 400 (invalid_world): Not trusted.",'UNKNOWN',undefined],
  ["Error invoking remote method 'another-channel': Error: Voyage HTTP 400 (invalid_world): Not trusted.",'UNKNOWN',undefined],
  ['Provider message: Voyage HTTP 400 (invalid_world): Not trusted.','UNKNOWN',undefined],
  ['Voyage HTTP 503 (server_error): Body includes Voyage HTTP 400 (invalid_world): Not trusted.','UNKNOWN',undefined]
 ] as const){
  const current=fixture();
  try{
   current.setPostFailure(failure);await assert.rejects(publicationAction(current.project,'publish'));const operation=current.rows()[0];
   assert.equal(operation.state,state);assert.equal(operation.retryAt,retryAt);
   if(retryAt){await assert.rejects(publicationAction(current.project,'publish',operation),/Retry no earlier/);assert.equal(current.posts.length,1);}
  }finally{current.close();}
 }
});

test('unreadable cooldowns fail closed and inspection never dispatches a mutation',async()=>{
 const current=fixture();
 try{
  current.setPostFailure('Voyage HTTP 429: Wait. Retry-After: invalid. Invalid server cooldown; automatic retry stopped.');
  await assert.rejects(publicationAction(current.project,'publish'));const operation=current.rows()[0];assert.equal(operation.retryBlocked,true);
  await assert.rejects(publicationAction(current.project,'publish',operation),/unreadable cooldown/);
  await publicationAction(current.project,'publish',operation,true);assert.equal(current.posts.length,1);assert.equal(current.rows()[0].state,'RETRYABLE');
 }finally{current.close();}
});

test('a clean quota rejection can retry after the daily reset without an ambiguous expired-key lock',async context=>{
 let now=Date.parse('2026-10-24T12:00:00Z');context.mock.method(Date,'now',()=>now);
 const current=fixture();
 try{
  current.setPostFailure('Voyage HTTP 429 (moderation_daily_limit): Wait. Retry-After: 86400.');
  await assert.rejects(publicationAction(current.project,'publish'));const operation=current.rows()[0];now+=25*60*60*1000;
  current.setPostFailure('Connection lost after dispatch');await assert.rejects(publicationAction(current.project,'publish',operation),/Connection lost/);
  assert.equal(current.posts.length,2);assert.equal(current.posts[1].idempotencyKey,operation.id);assert.equal(current.rows()[0].sentAt,now);
  current.setPostFailure('');await publicationAction(current.project,'publish',current.rows()[0]);assert.equal(current.posts.length,3);
 }finally{current.close();}
});

test('read-back recovery after acknowledgement ignores later local edits and never posts twice',async()=>{
 const current=fixture();
 try{
  current.setResponse('');current.setAfterPostReadFailure('Read-back connection lost');
  await assert.rejects(publicationAction(current.project,'publish'),/Read-back/);
  const operation=current.rows()[0];assert.equal(operation.state,'ACKNOWLEDGED');assert.equal(operation.result,null);
  current.project.activeSource='{"initialGameState":{"edited":true}}';current.project.draft={path:[],text:'{}',baseHash:'base'};current.project.remote.operations=[{state:'UNKNOWN'}];
  current.setAfterPostReadFailure('');await publicationAction(current.project,'publish',operation);
  assert.equal(current.rows()[0].state,'CONFIRMED');assert.equal(current.posts.length,1);
 }finally{current.close();}
});

test('a malformed success body stays acknowledged rather than replaying the mutation',async()=>{
 const current=fixture();
 try{
  current.setResponse('not json');await assert.rejects(publicationAction(current.project,'publish'));
  const operation=current.rows()[0];assert.equal(operation.state,'ACKNOWLEDGED');
  await publicationAction(current.project,'publish',operation);assert.equal(current.posts.length,1);
 }finally{current.close();}
});

test('changed source, world, revision, or selected host cannot replay an uncertain action',async()=>{
 for(const change of ['source','world','revision','host','remote']){
  const current=fixture();
  try{
   current.setPostFailure('Connection lost');await assert.rejects(publicationAction(current.project,'publish'));const operation=current.rows()[0];current.setPostFailure('');
   if(change==='source')current.project.activeSource='{"initialGameState":{"changed":true}}';
   if(change==='world')current.project.remote.worldId='OTHER';
   if(change==='revision')current.project.remote.etag='"new"';
   if(change==='host')current.connection.apiBase='https://different.example/creator/v1';
   if(change==='remote')current.setRemote(current.project.activeSource,'"new"');
   await assert.rejects(publicationAction(current.project,'publish',operation),/changed|no longer matches/);
   assert.equal(current.posts.length,1);assert.equal(current.rows()[0].state,'UNKNOWN');
   await assert.rejects(publicationAction(current.project,'publish'),/recorded publication/);
  }finally{current.close();}
 }
});

test('changes during preflight are caught before dispatch',async()=>{
 const current=fixture();
 try{
  current.setCheckpoint(()=>{current.project.activeSource='{"initialGameState":{"changed":true}}';});
  await assert.rejects(publicationAction(current.project,'publish'),/source.*changed/);
  assert.equal(current.posts.length,0);assert.equal(current.rows()[0].state,'REJECTED');
 }finally{current.close();}
});

test('changed content after a clean rejection retires the old request without replaying it',async()=>{
 const current=fixture();
 try{
  current.setPostFailure('Voyage HTTP 503 (studio_unavailable): Clean availability rejection.');
  await assert.rejects(publicationAction(current.project,'publish'));const operation=current.rows()[0];
  current.project.activeSource=current.project.activeSource.replace('"title":"World"','"title":"Edited"');
  current.setRemote(current.project.activeSource);current.setPostFailure('');
  await assert.rejects(publicationAction(current.project,'publish',operation),/source.*changed/);
  assert.equal(current.rows()[0].state,'REJECTED');assert.equal(current.posts.length,1);
  await publicationAction(current.project,'publish');assert.equal(current.posts.length,2);assert.notEqual(current.posts[1].idempotencyKey,operation.id);
 }finally{current.close();}
});

test('concurrent callers cannot reserve new keys or overwrite another journal owner',async()=>{
 const current=fixture();
 try{
  const results=await Promise.allSettled([publicationAction(current.project,'publish'),publicationAction(current.project,'publish')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(current.posts.length,1);assert.equal(current.rows().length,1);
 }finally{current.close();}
 const conflicted=fixture();
 try{
  conflicted.setBeforeWrite(payload=>{if(!conflicted.store.has(payload.key))conflicted.store.set(payload.key,'[{"id":"other-owner","state":"UNKNOWN"}]');});
  await assert.rejects(publicationAction(conflicted.project,'publish'),/feature changed/);
  assert.equal(conflicted.posts.length,0);assert.equal(conflicted.rows()[0].id,'other-owner');
 }finally{conflicted.close();}
});

test('ownership loss immediately before dispatch prevents the losing writer from posting',async()=>{
 const current=fixture();
 try{
  current.setBeforeWrite(payload=>{
   const records=JSON.parse(payload.value);if(records[0].state==='SEND_ATTEMPTED')current.store.set(payload.key,JSON.stringify([{...records[0],owner:'winner'}]));
  });
  await assert.rejects(publicationAction(current.project,'publish'),/feature changed/);assert.equal(current.posts.length,0);assert.equal(current.rows()[0].owner,'winner');
 }finally{current.close();}
});

test('expired and legacy ambiguous operations remain blocking and inspectable without new keys',async context=>{
 let now=Date.parse('2026-10-24T12:00:00Z');context.mock.method(Date,'now',()=>now);
 const current=fixture();
 try{
  current.setPostFailure('Connection lost');await assert.rejects(publicationAction(current.project,'publish'));const operation=current.rows()[0];
  now+=24*60*60*1000;await assert.rejects(publicationAction(current.project,'publish',operation),/replay window expired/);
  await publicationAction(current.project,'publish',operation,true);assert.equal(current.rows()[0].state,'UNKNOWN');assert.equal(current.posts.length,1);
  await assert.rejects(publicationAction(current.project,'publish'),/do not create a new key/);
  delete operation.environment;current.store.set('publication:'+current.project.id,JSON.stringify([operation]));
  await assert.rejects(publicationAction(current.project,'publish',operation),/environment is missing/);assert.equal(current.posts.length,1);
 }finally{current.close();}
});

test('publication journal distinguishes retry, acknowledgement, rejection, and persisted cooldown',()=>{
 const base:PublicationOperation={id:'op',kind:'publish',worldId:'WORLD',body:'{}',sourceHash:'hash',created:Date.now(),state:'UNKNOWN',environment:'alpha',apiBase:'https://api-alpha.aidungeon.com/creator/v1'};
 const render=(operation:PublicationOperation)=>renderToStaticMarkup(<PublicationJournal operations={[operation]} busy={false} onReplay={()=>{}} onInspect={()=>{}}/>);
 assert.match(render(base),/Retry exact request/);assert.match(render(base),/Inspect remote outcome/);
 assert.match(render({...base,state:'ACKNOWLEDGED',result:null}),/Finish acknowledged action/);
 assert.doesNotMatch(render({...base,state:'REJECTED'}),/Retry exact request|Inspect remote outcome/);
 const cooling={...base,state:'RETRYABLE',retryAt:Date.now()+60000};assert.match(render(cooling),/disabled=""[^>]*>Retry exact request/);assert.match(render(cooling),/Retry no earlier than/);
 assert.match(publicationCooldown({...base,retryBlocked:true}),/unreadable cooldown/);
});
