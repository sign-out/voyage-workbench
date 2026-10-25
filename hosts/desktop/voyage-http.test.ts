import assert from 'node:assert/strict';
import test from 'node:test';
import {voyageHttp,VoyageHttpError} from './voyage-http';
import {voyageCleanRejection,voyageRetryAfter} from '../../packages/core/voyage-api';

function harness(responses:Array<Response|Error>){
  let clock=Date.parse('2026-10-24T12:00:00Z');const waits:number[]=[],calls:RequestInit[]=[];
  return {waits,calls,runtime:{now:()=>clock,sleep:async(delay:number)=>{waits.push(delay);clock+=delay;},fetch:async(_url:any,options?:RequestInit)=>{calls.push(options!);const next=responses.shift();if(next instanceof Error)throw next;if(!next)throw new Error('Unexpected request');return next;}}};
}
const failure=(status:number,code='',headers:Record<string,string>={})=>new Response(JSON.stringify({error:{code,message:'Please try later'},requestId:'safe-id\r\n!'}),{status,headers});

test('safe GET retries transport failures and temporary responses with the same credentials and a bounded budget',async()=>{
  const fixture=harness([new TypeError('fetch failed'),failure(503),new Response('large exact JSON 9007199254740993',{headers:{etag:'"revision"'}})]);
  const headers={Authorization:'Bearer synthetic'};
  assert.deepEqual(await voyageHttp('https://example.invalid/worlds',{method:'GET',headers},fixture.runtime),{text:'large exact JSON 9007199254740993',etag:'"revision"'});
  assert.deepEqual(fixture.waits,[500,1000]);assert.equal(fixture.calls.length,3);
  assert.ok(fixture.calls.every(call=>call.headers===headers&&call.redirect==='error'&&call.signal===fixture.calls[0].signal));
});
test('GET respects delta/date Retry-After and stops after three attempts',async()=>{
  const fixture=harness([failure(429,'',{'Retry-After':'2'}),failure(503,'',{'Retry-After':'Sat, 24 Oct 2026 12:00:05 GMT'}),failure(502)]);
  await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'GET'},fixture.runtime),/Voyage HTTP 502/);
  assert.deepEqual(fixture.waits,[2000,3000]);assert.equal(fixture.calls.length,3);
});
test('long, malformed, negative or overflowing cooldowns never trigger an early automatic retry',async()=>{
  for(const header of ['60','invalid','-1','0.1','Tue, 31 Feb 2026 12:00:00 GMT','Mon, 24 Oct 2026 12:00:00 GMT','9999999999999999999999999999999999']){
    const fixture=harness([failure(429,'',{'Retry-After':header})]);
    await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'GET'},fixture.runtime),error=>error instanceof VoyageHttpError&&error.status===429&&/Retry no earlier|invalid cooldown/.test(error.message));
    assert.equal(fixture.calls.length,1);assert.deepEqual(fixture.waits,[]);
  }
  assert.equal(voyageRetryAfter('Sat, 24 Oct 2026 11:59:59 GMT',Date.parse('2026-10-24T12:00:00Z')),0);
});
test('a rate limit without a server cooldown fails closed rather than guessing the reset',async()=>{
  const fixture=harness([failure(429)]);
  await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'GET'},fixture.runtime),/rate limited/);
  assert.equal(fixture.calls.length,1);assert.deepEqual(fixture.waits,[]);
});
test('mutations and semantic failures never automatically replay',async()=>{
  for(const method of ['POST','PUT','DELETE','PATCH'])for(const response of [failure(503,'studio_unavailable'),failure(429),new TypeError('lost response')]){
    const fixture=harness([response]);await assert.rejects(voyageHttp('https://example.invalid/worlds',{method,body:'{}',headers:{'Idempotency-Key':'original'}},fixture.runtime));
    assert.equal(fixture.calls.length,1);assert.deepEqual(fixture.waits,[]);
  }
  for(const [status,code] of [[401,''],[403,'creator_api_access_required'],[412,'revision_conflict'],[409,'studio_version_mismatch'],[503,'request_status_unknown'],[503,'request_in_progress']] as const){
    const fixture=harness([failure(status,code)]);await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'GET'},fixture.runtime));assert.equal(fixture.calls.length,1);
  }
});
test('failure messages retain usable recovery details through string-only bridges',async()=>{
  for(const [status,code,expected] of [[400,'invalid_revision',/Download the current draft/],[409,'studio_version_mismatch',/Do not change version/],[503,'request_status_unknown',/Reconcile the live world/],[503,'studio_unavailable',/clean availability rejection/],[401,'',/Reconnect/],[403,'creator_api_access_required',/Enable Creator API access/]] as const){
    const fixture=harness([failure(status,code,{'Retry-After':'60'})]);await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'POST'},fixture.runtime),error=>{
      assert.ok(error instanceof VoyageHttpError);assert.match(error.message,expected);assert.match(error.message,/Request ID: safe-id\./);assert.match(error.message,/2026-10-24T12:01:00.000Z/);assert.equal(error.code,code);return true;
    });
  }
});
test('uncertain outcomes never become clean rejections',()=>{
  assert.equal(voyageCleanRejection(503,'studio_unavailable'),true);
  assert.equal(voyageCleanRejection(409,'studio_version_mismatch'),true);
  assert.equal(voyageCleanRejection(429,''),true);
  assert.equal(voyageCleanRejection(400,'request_status_unknown'),false);
  assert.equal(voyageCleanRejection(429,'request_in_progress'),false);
  assert.equal(voyageCleanRejection(503,''),false);
});
test('read retries stop when the shared deadline would be exceeded',async()=>{
  let clock=0,calls=0;const waits:number[]=[];
  await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'GET'},{now:()=>clock,sleep:async delay=>{waits.push(delay);clock+=delay;},fetch:async()=>{calls++;clock=44900;return failure(503);}}),/Voyage HTTP 503/);
  assert.equal(calls,1);assert.deepEqual(waits,[]);
});
test('interrupted retry waits do not dispatch another request',async()=>{
  const fixture=harness([failure(503)]);
  await assert.rejects(voyageHttp('https://example.invalid/worlds',{method:'GET'},{...fixture.runtime,sleep:async()=>{throw new Error('Interrupted');}}),/Interrupted/);
  assert.equal(fixture.calls.length,1);
});
test('an unreadable error body cannot bypass its cooldown or unknown-outcome safety code',async()=>{
  for(const method of ['GET','POST']){
    const response=new Response(new ReadableStream({start(controller){controller.error(new TypeError('body disconnected'));}}),{status:429,headers:{'Retry-After':'60'}});
    const fixture=harness([response]);
    await assert.rejects(voyageHttp('https://example.invalid/worlds',{method},fixture.runtime),error=>{
      assert.match((error as Error).message,/error response could not be read/);assert.equal((error as any).status,undefined);return true;
    });
    assert.equal(fixture.calls.length,1);assert.deepEqual(fixture.waits,[]);
  }
});
