import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as doc from './document';
import {create,reduce,hash,remotePayload} from './project';

const envelope='{"shortId":"WORLD","title":"API title","description":"API metadata","visibility":"private","initialGameState":{"npcs":{"Ada":{"name":"Ada","hp":9007199254740993}},"keep":-0,"fraction":1.000,"remove":"old"},"loadStatus":"ready"}';
const state='{"npcs":{"Ada":{"name":"Edited","hp":9007199254740995}},"keep":0,"fraction":1.000,"added":1E+99}';

test('linked import restores removed schema fields and rejects new untrusted managed flags',()=>{
 const trusted='{"shortId":"WORLD","initialGameState":{"heroesVersion":"alpha","compatibilityRevision":9007199254740993,"text":"Before"}}';
 let project=create('p','Linked',trusted,1);
 project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'v1',envelopeSource:trusted});
 project=reduce(project,{type:'stage',id:'import',kind:'import',source:'{"shortId":"OTHER","canSafelySave":true,"degradedReason":"untrusted","initialGameState":{"text":"After","custom":{"compatibilityRevision":"authored"}}}'});
 project=reduce(project,{type:'accept',id:'import'});
 assert.equal(doc.read(project.activeSource,['shortId']),'"WORLD"');
 assert.equal(doc.read(project.activeSource,['initialGameState','compatibilityRevision']),'9007199254740993');
 assert.equal(doc.read(project.activeSource,['initialGameState','heroesVersion']),'"alpha"');
 assert.equal(doc.read(project.activeSource,['initialGameState','custom','compatibilityRevision']),'"authored"');
 assert.throws(()=>doc.read(project.activeSource,['canSafelySave']));
 assert.throws(()=>doc.read(project.activeSource,['degradedReason']));
 assert.equal(project.remote.envelopeSource,trusted);assert.equal(project.remote.operations.length,0);
});

test('linked JSON imports cannot replace identity, load flags or schema revisions across wrappers',()=>{
 const trusted='{"shortId":"WORLD","loadStatus":"ready","canSafelySave":true,"initialGameState":{"heroesVersion":"alpha-current","compatibilityRevision":9007199254740993,"npcs":{"Ada":{"name":"Original"}},"custom":{"compatibilityRevision":"authored"}}}';
 for(const incoming of [
  '{"heroesVersion":"old","compatibilityRevision":1,"npcs":{"Ada":{"name":"Edited"}}}',
  '{"shortId":"OTHER","loadStatus":"broken","canSafelySave":false,"initialGameState":{"npcs":{"Ada":{"name":"Edited"}}}}',
  '{"data":{"world":{"shortId":"OTHER","loadStatus":"broken","initialGameState":{"heroesVersion":"old","compatibilityRevision":1,"npcs":{"Ada":{"name":"Edited"}}}}}}'
 ]){
  let project=create('p','Linked world',trusted,1);project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'v1',envelopeSource:trusted});
  project=reduce(project,{type:'stage',id:'import',kind:'import',source:incoming});assert.match(project.candidates[0].importNote!,/Protected Voyage fields retained/);
  const value=(text:string,path:doc.Path)=>{try{return doc.read(text,path);}catch{return undefined;}};
  for(const path of doc.voyageManagedPaths(trusted))assert.equal(value(project.candidates[0].source,path),value(trusted,path));
  project=reduce(project,{type:'accept',id:'import'});assert.equal(doc.read(project.activeSource,['initialGameState','npcs','Ada','name']),'"Edited"');assert.equal(project.remote.worldId,'WORLD');assert.equal(project.remote.etag,'v1');assert.equal(project.remote.operations.length,0);
 }
 assert.equal(doc.explorerDescribe(trusted,['initialGameState','compatibilityRevision']).readOnly,true);
 assert.equal(doc.explorerDescribe(trusted,['initialGameState','custom','compatibilityRevision']).readOnly,false);
});
test('acceptance rechecks old imported proposals and explicit API refresh may update managed fields',()=>{
 const trusted='{"shortId":"WORLD","initialGameState":{"heroesVersion":"current","compatibilityRevision":3,"text":"Before"}}';
 let project=create('p','Linked',trusted,1);project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'WORLD',etag:'v1',envelopeSource:trusted});
 project.candidates.push({id:'old',title:'Old import',source:'{"shortId":"OTHER","initialGameState":{"text":"After"}}',baseHash:hash(trusted),created:1,kind:'import'});
 project=reduce(project,{type:'accept',id:'old'});assert.equal(doc.read(project.activeSource,['shortId']),'"WORLD"');assert.equal(doc.read(project.activeSource,['initialGameState','compatibilityRevision']),'3');assert.equal(doc.read(project.activeSource,['initialGameState','text']),'"After"');
 project=reduce(project,{type:'stage',id:'refresh',kind:'remote',source:trusted.replace('"current"','"new-current"').replace('Revision":3','Revision":4')});project=reduce(project,{type:'accept',id:'refresh'});assert.equal(doc.read(project.activeSource,['initialGameState','heroesVersion']),'"new-current"');assert.equal(doc.read(project.activeSource,['initialGameState','compatibilityRevision']),'4');
 assert.throws(()=>doc.preserveVoyageFields(trusted,'{"initialGameState":null}'),/object GameState/);
});
test('upload recovery preserves downloaded schema versions without losing edited content or exact numbers',()=>{
 const trusted='{"shortId":"WORLD","initialGameState":{"heroesVersion":"alpha","compatibilityRevision":3,"number":9007199254740993}}';
 const edited=trusted.replace('"alpha"','"old"').replace('Revision":3','Revision":1').replace('9007199254740993','9007199254740995');
 const payload=remotePayload(edited,trusted,'WORLD');assert.equal(doc.read(payload,['world','initialGameState','heroesVersion']),'"alpha"');assert.equal(doc.read(payload,['world','initialGameState','compatibilityRevision']),'3');assert.equal(doc.read(payload,['world','initialGameState','number']),'9007199254740995');
 assert.throws(()=>remotePayload(edited.replace('WORLD','OTHER'),trusted,'WORLD'),/shortId/);
 assert.equal(doc.read(remotePayload('{"world":'+edited+'}',trusted,'WORLD'),['world','shortId']),'"WORLD"');
});

test('raw GameState imports align inside the downloaded envelope instead of deleting API metadata',()=>{
 const project=create('p','Imported',envelope,1),staged=reduce(project,{type:'stage',id:'c',source:state,kind:'import'});
 assert.equal(staged.activeSource,envelope);assert.match(staged.candidates[0].importNote||'',/metadata.*preserved/);
 assert.equal(doc.read(staged.candidates[0].source,['shortId']),'"WORLD"');assert.equal(doc.read(staged.candidates[0].source,['title']),'"API title"');
 assert.ok(doc.diff(envelope,staged.candidates[0].source).changes.every(change=>change.path[0]==='initialGameState'));
 const accepted=reduce(staged,{type:'accept',id:'c'});assert.equal(doc.read(accepted.activeSource,['initialGameState']),state);
});
test('selective rejection persists, can be reversed, and applies only selected changes',()=>{
 let project=reduce(create('p','Imported',envelope,1),{type:'stage',id:'c',source:state,kind:'import'});
 const choose=(path:doc.Path,kind:doc.Change['kind'],reject=true)=>{project=reduce(project,{type:'candidateChange',id:'c',path,kind,reject,candidateHash:hash(project.candidates[0].source)});};
 choose(['initialGameState','npcs','Ada','hp'],'changed');choose(['initialGameState','remove'],'removed');choose(['initialGameState','added'],'added');choose(['initialGameState','keep'],'changed');choose(['initialGameState','keep'],'changed',false);
 assert.equal(project.activeSource,envelope);project=JSON.parse(JSON.stringify(project));assert.equal(project.candidates[0].rejectedChanges?.length,3);
 project=reduce(project,{type:'accept',id:'c'});assert.equal(doc.read(project.activeSource,['initialGameState','npcs','Ada','hp']),'9007199254740993');assert.equal(doc.read(project.activeSource,['initialGameState','npcs','Ada','name']),'"Edited"');assert.equal(doc.read(project.activeSource,['initialGameState','remove']),'"old"');assert.throws(()=>doc.read(project.activeSource,['initialGameState','added']));assert.equal(doc.read(project.activeSource,['initialGameState','keep']),'0');assert.equal(doc.read(project.activeSource,['initialGameState','fraction']),'1.000');assert.equal(project.candidates.length,0);
});
test('ordering can be rejected independently of field edits and arrays remain atomic',()=>{
 const before='{"a":1,"b":2,"list":[9007199254740993,-0],"gone":1}',after='{"b":3,"a":1,"list":[9007199254740995,0],"new":1E+99}';
 const result=doc.selectChanges(before,after,[{path:[],kind:'order'},{path:['list'],kind:'changed'},{path:['gone'],kind:'removed'}]);
 assert.deepEqual(doc.describe(result).children.map(child=>child.key),['a','b','list','gone','new']);assert.equal(doc.read(result,['b']),'3');assert.equal(doc.read(result,['list']),'[9007199254740993,-0]');assert.equal(doc.read(result,['new']),'1E+99');
 const all=doc.selectChanges(before,after,doc.diff(before,after).changes);assert.equal(doc.diff(before,all).total,0);
});
test('review choices reject unknown paths, stale proposals and changed proposal snapshots',()=>{
 let project=reduce(create('p','Imported',envelope,1),{type:'stage',id:'c',source:state});const command={type:'candidateChange',id:'c',path:['missing'],kind:'changed',reject:true,candidateHash:hash(project.candidates[0].source)};
 assert.throws(()=>reduce(project,command),/no longer exists/);assert.throws(()=>reduce(project,{...command,candidateHash:'old'}),/proposal changed/);
 project=reduce(project,{type:'edit',path:['title'],source:'"Changed"',baseHash:hash(project.activeSource)});assert.throws(()=>reduce(project,command),/world changed/);assert.throws(()=>reduce(project,{type:'accept',id:'c'}),/world changed/);
});
test('wrapped envelopes align to current shape without numeric reserialization',()=>{
 const incoming='{"data":{"world":'+envelope+'},"requestId":"not-world-data"}';const aligned=doc.alignImport(envelope,incoming);assert.equal(doc.diff(envelope,aligned.source).total,0);
 assert.equal(doc.read(doc.alignImport(state,incoming).source,['npcs','Ada','hp']),'9007199254740993');
});
test('legacy raw-state projects recover save envelopes from the preserved download',()=>{
 const payload=remotePayload(state,envelope,'WORLD');assert.equal(doc.read(payload,['world','shortId']),'"WORLD"');assert.equal(doc.read(payload,['world','title']),'"API title"');assert.equal(doc.read(payload,['world','initialGameState']),state);assert.throws(()=>doc.read(payload,['world','loadStatus']));
 assert.throws(()=>remotePayload(state,undefined,'WORLD'),/Re-import/);assert.throws(()=>remotePayload(state,envelope,'OTHER'),/shortId/);
});
test('diff pages expose later changes and selective rejection is not limited to the first page',()=>{
 const before='{'+Array.from({length:2010},(_,index)=>JSON.stringify('field'+index)+':0').join(',')+'}',after='{'+Array.from({length:2010},(_,index)=>JSON.stringify('field'+index)+':1').join(',')+'}';
 assert.equal(doc.diff(before,after).changes.length,2000);assert.equal(doc.diff(before,after,2000,2000).changes.length,10);
 let project=reduce(create('p','Large diff',before,1),{type:'stage',id:'c',source:after});project=reduce(project,{type:'candidateChange',id:'c',path:['field2009'],kind:'changed',reject:true,candidateHash:hash(project.candidates[0].source)});project=reduce(project,{type:'accept',id:'c'});
 assert.equal(doc.read(project.activeSource,['field2009']),'0');assert.equal(doc.read(project.activeSource,['field0']),'1');
});
