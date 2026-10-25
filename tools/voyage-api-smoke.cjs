const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'voyage-api-smoke-'));
app.setPath('userData',directory);
const timeout=setTimeout(()=>{console.error('Voyage API smoke timed out');app.exit(1);},60000);
let scenario='read',calls=0;
globalThis.fetch=async(url,options={})=>{
 assert.equal(new URL(String(url)).hostname,'api-alpha.aidungeon.com');
 assert.equal(options.headers.Authorization,'Bearer synthetic-api-smoke');
 calls++;
 if(scenario==='read'){
  assert.equal(options.method,'GET');
  if(calls===1)throw new TypeError('Synthetic connection interruption');
  return new Response('{"data":{"worlds":[]}}');
 }
 if(scenario==='cooldown')return new Response('{"error":{"code":"rate_limited","message":"Synthetic cooldown"},"requestId":"fixture-id!"}',{status:429,headers:{'Retry-After':'60'}});
 assert.equal(options.method,'POST');
 assert.equal(options.headers['Idempotency-Key'],'original-request-key');
 return new Response('{"error":{"code":"request_status_unknown","message":"Synthetic lost receipt"},"requestId":"unknown-fixture"}',{status:503});
};
app.on('browser-window-created',(_,window)=>window.webContents.once('did-finish-load',async()=>{
 try{
  const evaluate=expression=>window.webContents.executeJavaScript(expression);
  await evaluate(`window.voyage.invoke('connectVoyage',{key:'synthetic-api-smoke'})`);
  const list=await evaluate(`window.voyage.invoke('remoteWorlds',{page:0})`);
  assert.deepEqual(list.data.worlds,[]);assert.equal(calls,2);
  scenario='cooldown';calls=0;
  const rateError=await evaluate(`window.voyage.invoke('remoteWorlds',{page:0}).then(()=>'',error=>error.message)`);
  assert.equal(calls,1);assert.match(rateError,/Voyage HTTP 429 \(rate_limited\):/);
  assert.match(rateError,/Retry no earlier than \d{4}-/);assert.match(rateError,/Request ID: fixture-id\./);
  scenario='mutation';calls=0;
  const unknownError=await evaluate(`window.voyage.invoke('creatorRequest',{method:'POST',endpoint:'/worlds',body:'{}',idempotencyKey:'original-request-key'}).then(()=>'',error=>error.message)`);
  assert.equal(calls,1);assert.match(unknownError,/request_status_unknown/);assert.match(unknownError,/Reconcile the live world/);
  assert.match(unknownError,/original request key/);
  console.log(JSON.stringify({ok:true,boundedReadRetry:true,cooldownSurvivesIpc:true,requestIdSurvivesIpc:true,noMutationReplay:true}));
  clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
}));
require('../build/desktop/main.cjs');
