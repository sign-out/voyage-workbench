const test=require('node:test');
const assert=require('node:assert/strict');
const {runChecks,validationBody}=require('./voyage-api-authenticated.cjs');

test('live checks allow only Alpha reads and validation, with redacted results',async()=>{
 const requests=[];
 const report=await runChecks('synthetic-secret',async(url,options)=>{
  requests.push({url,options});
  assert.equal(new URL(url).origin,'https://api-alpha.aidungeon.com');
  assert.equal(options.headers.Authorization,'Bearer synthetic-secret');
  assert.equal(options.redirect,'error');
  const endpoint=url.slice(url.indexOf('/creator/v1')+'/creator/v1'.length);
  let data={private:'private-content'};
  if(endpoint==='/worlds?page=0')data={data:{worlds:[{shortId:'owned-world',title:'private-title'}]}};
  if(endpoint.endsWith('/revisions'))data={data:{revisions:[{id:'actual-revision'}]}};
  if(endpoint==='/validate'){assert.equal(options.method,'POST');data={data:{valid:true,stage:JSON.parse(options.body).stage,errors:[],warnings:[]}};}
  else assert.equal(options.method,'GET');
  return new Response(JSON.stringify(data));
 },(_text,stage)=>JSON.stringify({stage,world:{initialGameState:{}}}));
 assert.equal(requests.length,11);
 assert.equal(report.mutationsSent,0);
 assert.equal(report.attemptedChecksPassed,true);
 assert.equal(report.checks.filter(check=>check.contractValid).length,2);
 assert.doesNotMatch(JSON.stringify(report),/synthetic-secret|private-content|private-title|owned-world|actual-revision/);
});

test('auth, throttling and temporary server failures halt without retry or body leaks',async()=>{
 for(const status of [401,403,429,503]){
  let calls=0;
  const report=await runChecks('synthetic-secret',async()=>{calls++;return new Response('private-error-body',{status});});
  assert.equal(calls,1);assert.equal(report.halted,true);assert.equal(report.checks[0].status,status);
  assert.equal(report.attemptedChecksPassed,false);
  assert.doesNotMatch(JSON.stringify(report),/private-error-body|synthetic-secret/);
 }
});

test('missing keys do not dispatch and malformed responses stop without retries',async()=>{
 let calls=0;
 await assert.rejects(runChecks('',async()=>{calls++;}),/No Alpha/);assert.equal(calls,0);
 const report=await runChecks('synthetic-secret',async()=>{calls++;throw new Error('synthetic-secret private-network-details');});
 assert.equal(calls,1);assert.equal(report.halted,true);assert.doesNotMatch(JSON.stringify(report),/synthetic-secret|private-network-details/);
});

test('unrecognized world identity never causes guessed world downloads or writes',async()=>{
 const requests=[];
 const report=await runChecks('synthetic-secret',async(url)=>{requests.push(url);return new Response('{"data":{"worlds":[{"id":"not-a-confirmed-shortId"}]}}');});
 assert.equal(report.worldAvailable,false);assert.equal(requests.length,5);
 assert.ok(requests.every(url=>!url.includes('/worlds/')));
});
test('validation bodies preserve downloaded exact numbers and reject unrecognized envelopes',()=>{
 const body=validationBody('{"data":{"world":{"title":"Private","initialGameState":{"exact":9007199254740993}}}}','draft');
 assert.match(body,/9007199254740993/);assert.equal(JSON.parse(body).stage,'draft');assert.ok(JSON.parse(body).world.initialGameState);
 assert.throws(()=>validationBody('{"data":{"unrecognized":true}}','draft'),/no recognized initialGameState/);
 assert.throws(()=>validationBody('{"initialGameState":{}}','invalid'),/Unsupported validation stage/);
});
