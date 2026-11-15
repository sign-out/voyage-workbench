import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncCompanion,syncImportPreview,syncSource,syncPayload,type SyncState} from './sync-companion';
import * as doc from './document';

function fixture(){
 const triggers=Object.fromEntries(Array.from({length:17},(_,index)=>['trigger-'+index,{description:'Before '+index}]));
 const original='{"shortId":"WORLD","title":"Shared world","initialGameState":{"heroesVersion":37,"compatibilityRevision":9,"exact":90071992547409931234,"triggers":'+JSON.stringify(triggers)+',"parties":{"main":{"quests":{"keep":{"name":"Keep this quest"}}}}}}';
 let state:SyncState={format:1,revision:0,environment:'production'},remote=original,etag='revision-1',readbackFailure=false,writeFailure=false,returnedChange=false,serverAddition=false;
 const calls:{method:string;payload:any}[]=[],progress:string[]=[];
 const persist=(next:SyncState)=>{state=structuredClone({...next,revision:state.revision+1});return structuredClone(state);};
 const invoke=async(method:string,payload:any={})=>{
  calls.push({method,payload:structuredClone(payload)});
  if(method==='state')return structuredClone(state);
  if(method==='commit'){assert.equal(payload.expectedRevision,state.revision);return persist(payload.state);}
  if(method==='readWorld')return {text:'{"data":{"world":'+remote+'}}',etag};
  if(method==='sendSave'){
   assert.equal(state.pending!.state,'prepared');assert.equal(state.pending!.id,payload.id);assert.equal(state.pending!.environment,state.environment);assert.match(state.pending!.etag,/^"revision-/);
   state.pending!.state='sending';remote=doc.read(state.pending!.payload,['world']);etag='revision-2';
   if(serverAddition)remote=remote.replace('"exact":','"serverAdded":{"label":"Generated"},"exact":');
   if(returnedChange)remote=doc.edit(remote,['title'],'"Remote changed title"');
   state.pending!.state=writeFailure?'unknown':'acknowledged';return persist(state);
  }
  if(method==='readback'){if(readbackFailure)throw new Error('Read-back offline');state.pending!.readback={text:'{"data":{"world":'+remote+'}}',etag};return persist(state);}
  if(method==='resolveSave'){
   assert.equal(payload.id,state.pending!.id);assert.equal(payload.source,remote);assert.equal(payload.etag,etag);
   return persist({...state,world:{id:'WORLD',source:remote,etag,environment:state.pending!.environment},draft:undefined,history:[{name:'Submitted',source:state.pending!.source}],pending:undefined});
  }
  if(method==='discardUnsent')return persist({...state,pending:undefined});
  throw new Error('Unexpected native action '+method);
 };
 const engine=new SyncCompanion(invoke,message=>progress.push(message));
 const imported=JSON.stringify({triggers:Object.fromEntries(Array.from({length:17},(_,index)=>['trigger-'+index,{description:'After '+index}]))});
 return {engine,invoke,calls,progress,original,imported,state:()=>state,setReadbackFailure:(value:boolean)=>{readbackFailure=value;},setWriteFailure:(value:boolean)=>{writeFailure=value;},setReturnedChange:(value:boolean)=>{returnedChange=value;},setServerAddition:(value:boolean)=>{serverAddition=value;},setRemote:(value:string)=>{remote=value;etag='revision-remote';}};
}

test('micro companion imports partial GameState as 17 world changes and saves once with exact numbers and server additions',async()=>{
 const current=fixture(),engine=current.engine;await engine.load();await engine.download('WORLD',()=>true);
 await engine.importFile('partial.json',current.imported);let preview=syncImportPreview(engine.state)!;
 assert.equal(preview.report!.total,17);assert.equal(preview.report!.counts.world,17);assert.match(preview.source,/90071992547409931234/);assert.match(preview.source,/Keep this quest/);assert.equal(current.calls.filter(call=>call.method==='sendSave').length,0);
 await engine.importMode('replace');preview=syncImportPreview(engine.state)!;assert.doesNotMatch(preview.source,/Keep this quest/);
 await engine.importMode('merge');await engine.acceptImport();assert.equal(engine.state.proposal,undefined);assert.equal(engine.state.history!.length,1);
 await engine.selectEnvironment('beta');assert.equal(engine.state.world!.environment,'production');
 await engine.save(message=>{assert.match(message,/17 world changes/);assert.match(message,/using beta/);return false;});assert.equal(current.calls.filter(call=>call.method==='sendSave').length,0);
 current.setServerAddition(true);await engine.save(()=>true);
 assert.equal(current.calls.filter(call=>call.method==='sendSave').length,1);assert.equal(engine.state.pending,undefined);assert.equal(engine.state.world!.environment,'beta');assert.match(syncSource(engine.state),/serverAdded/);assert.match(syncSource(engine.state),/90071992547409931234/);assert.match(syncSource(engine.state),/Keep this quest/);
 await engine.save(()=>{throw new Error('No-op save must not ask to upload');});assert.equal(current.calls.filter(call=>call.method==='sendSave').length,1);
 assert.ok(current.progress.some(message=>message.includes('Validating')));assert.ok(current.progress.some(message=>message.includes('server additions')));
 assert.throws(()=>syncPayload(current.original,'OTHER'),/identity differs/);
});

test('interrupted saves survive restart and connection changes, and divergent read-back needs explicit review without another write',async()=>{
 const current=fixture(),engine=current.engine;await engine.load();await engine.download('WORLD',()=>true);await engine.importFile('update.json',current.imported);await engine.acceptImport();
 current.setWriteFailure(true);current.setReadbackFailure(true);await assert.rejects(engine.save(()=>true),/offline/);assert.equal(current.state().pending!.state,'unknown');
 const resumed=new SyncCompanion(current.invoke);await resumed.load();await resumed.selectEnvironment('alpha');await assert.rejects(resumed.importFile('another.json','{}'),/unfinished save/);await assert.rejects(resumed.save(()=>true),/unfinished save/);
 current.setReadbackFailure(false);await resumed.reconcile(false,()=>true);assert.equal(resumed.state.pending,undefined);assert.equal(resumed.state.world!.environment,'production');assert.equal(resumed.state.environment,'alpha');assert.equal(current.calls.filter(call=>call.method==='sendSave').length,1);
 await resumed.importFile('changed.json','{"title":"My update","initialGameState":{"triggers":{"trigger-0":{"description":"Third wording"}}}}');await resumed.acceptImport();current.setReturnedChange(true);current.setWriteFailure(false);
 await resumed.save(()=>true);assert.ok(current.state().pending?.readback);await resumed.reconcile(true,()=>false);assert.ok(current.state().pending);const writes=current.calls.filter(call=>call.method==='sendSave').length;
 await resumed.reconcile(true,()=>true);assert.equal(resumed.state.pending,undefined);assert.equal(current.calls.filter(call=>call.method==='sendSave').length,writes);assert.ok(resumed.state.history?.[0].source);
});

test('local-first imports can be linked later and remote conflicts retain the local update rather than overwrite it',async()=>{
 const current=fixture(),engine=current.engine;await engine.load();await assert.rejects(engine.importFile('bad.json','[1,2,3]'),/object GameState/);assert.equal(current.state().proposal,undefined);await engine.importFile('offline.json',current.imported);await engine.acceptImport();assert.equal(engine.state.world,undefined);
 await assert.rejects(engine.save(()=>true),/Choose an owned/);await engine.download('WORLD',()=>true);assert.equal(syncImportPreview(engine.state)!.report!.total,17);await engine.acceptImport();
 current.setRemote(current.original.replace('Shared world','Edited elsewhere'));await assert.rejects(engine.save(()=>true),/remote world changed/i);assert.equal(current.calls.filter(call=>call.method==='sendSave').length,0);
 const local=syncSource(engine.state);await engine.download('WORLD',()=>false);assert.equal(syncSource(engine.state),local);
 await engine.download('WORLD',()=>true);assert.equal(engine.state.proposal!.source,local);assert.match(engine.state.world!.source,/Edited elsewhere/);
 await assert.rejects(engine.selectEnvironment('https://other.invalid'),/Unsupported/);
});
