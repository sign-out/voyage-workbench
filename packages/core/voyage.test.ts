import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voyageRevision,invalidRevisionFailure,compareRemoteWorlds,voyageSaveFeedback} from './voyage';
import {nativeRequest} from './project';

test('Voyage revisions strip weak ETag prefixes and quote opaque revisions exactly once',()=>{
  for(const revision of ['revision-1','"revision-1"','W/"revision-1"',' W/"revision-1" ']){
    assert.equal(voyageRevision(revision),'"revision-1"');
    assert.equal(JSON.parse(nativeRequest(JSON.stringify({operation:'voyageRevision',args:[revision]}))),'"revision-1"');
  }
  assert.equal(voyageRevision('W/"X7hGRob-_3Wqju-52E5AmUHvNipbd3Z8R5MiXDSwygY"'),'"X7hGRob-_3Wqju-52E5AmUHvNipbd3Z8R5MiXDSwygY"');
});
test('invalid revisions cannot become unconditional or injected If-Match headers',()=>{
  for(const revision of ['', 'W/""', '*', '"*"', '"one", "two"', '"broken', 'revision\r\nInjected: true', 'white space'])assert.throws(()=>voyageRevision(revision),/invalid world revision/);
});
test('only explicit invalid_revision rejection is recoverable without uncertain-save reconciliation',()=>{
  assert.equal(invalidRevisionFailure('Voyage HTTP 400 (invalid_revision): If-Match must contain the quoted world revision'),true);
  for(const detail of ['Connection lost after send','Voyage HTTP 500: Request rejected.','Voyage HTTP 400 (other): invalid_revision'])assert.equal(invalidRevisionFailure(detail),false);
});
test('remote confirmation ignores object ordering throughout arrays without changing local JSON',()=>{
  const submitted='{"world":{"initialGameState":{"second":2,"first":[{"name":"test","count":1.0}]}}}';
  const remote='{"world":{"initialGameState":{"first":[{"count":1,"name":"test"}],"second":2e0}}}';
  assert.equal(compareRemoteWorlds(submitted,remote).matches,true);
  assert.equal(JSON.parse(nativeRequest(JSON.stringify({operation:'compareRemoteWorlds',args:[submitted,remote]}))).matches,true);
  assert.equal(compareRemoteWorlds('{"n":-0}','{"n":0.0}').matches,true);
});
test('remote comparison retains exact large-number distinctions, field presence and array order',()=>{
  for(const [submitted,remote] of [['{"n":9007199254740993}','{"n":9007199254740992}'],['{"n":1e9007199254740993}','{"n":1e9007199254740992}'],['{"n":1}','{"n":"1"}'],['{"n":null}','{}'],['{"items":[1,2]}','{"items":[2,1]}']])assert.equal(compareRemoteWorlds(submitted,remote).matches,false);
  assert.equal(compareRemoteWorlds('{"n":900719925474099300}','{"n":9007199254740993e2}').matches,true);
  const differences=compareRemoteWorlds(JSON.stringify(Array.from({length:30},()=>1)),JSON.stringify(Array.from({length:30},()=>2)));
  assert.equal(differences.total,30);assert.equal(differences.paths.length,20);assert.equal(differences.truncated,true);
});
test('success feedback requires confirmed read-back; uncertain and rejected saves remain distinct',()=>{
  assert.equal(voyageSaveFeedback(null),null);
  assert.equal(voyageSaveFeedback({state:'CONFIRMED'})?.tone,'success');
  assert.equal(voyageSaveFeedback({state:'UNKNOWN',detail:'Read-back differs'})?.title,'Voyage save not confirmed');
  assert.equal(voyageSaveFeedback({state:'REJECTED',detail:'Revision conflict'})?.tone,'error');
  assert.match(voyageSaveFeedback({state:'UNKNOWN'})!.detail,/local project is safe/);
  assert.match(voyageSaveFeedback({state:'UNKNOWN',comparison:{paths:[['world','initialGameState','compatibilityRevision']]}})!.detail,/different schema-version fields/);
});
