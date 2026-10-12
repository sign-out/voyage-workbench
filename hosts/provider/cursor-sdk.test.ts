import test from 'node:test';import assert from 'node:assert/strict';
import {cursorOptions,cursorLoginUrl,cursorOperation} from './cursor-sdk';

test('Cursor SDK disables all built-in tools and ambient settings without cloud execution',()=>{
 const options=cursorOptions({operation:'turn',key:'fixture',context:JSON.stringify({system:'Use staged world tools.'}),model:'chosen'},'/private/session');
 assert.deepEqual(options.tools,[]);assert.deepEqual(options.mcpServers,{});assert.deepEqual(options.agents,{});assert.deepEqual(options.local.settingSources,[]);assert.equal(options.local.enableAgentRetries,false);assert.equal(options.local.cwd,'/private/session');assert.deepEqual(options.model,{id:'chosen'});assert(!('cloud' in options));
 assert.throws(()=>cursorOptions({operation:'turn',credentials:{apiKey:'expired',apiKeyExpiresAtMs:1},context:'{}'},'/private'));
});
test('Cursor sign-in URLs reject other origins, credentials, ports and unexpected paths',()=>{
 assert.equal(cursorLoginUrl('https://cursor.com/loginDeepControl?challenge=fixture'),'https://cursor.com/loginDeepControl?challenge=fixture');
 for(const url of ['http://cursor.com/loginDeepControl','https://cursor.com.evil.test/loginDeepControl','https://user@cursor.com/loginDeepControl','https://cursor.com:444/loginDeepControl','https://cursor.com/other'])assert.throws(()=>cursorLoginUrl(url));
});
test('Cursor login uses no disk credential store and emits only the narrow expiring key',async()=>{
 const events:any[]=[];let options:any;
 const sdk={Cursor:{auth:{login:async(value:any)=>{options=value;value.onLoginUrl('https://cursor.com/loginDeepControl?challenge=fixture');return {apiKey:'fixture',apiKeyExpiresAtMs:Date.now()+10000,email:'private@example.test'};}}}};
 await cursorOperation(sdk,{operation:'login'},'/private',event=>events.push(event),new AbortController().signal);
 assert.equal(options.store,null);assert.equal(options.openBrowser,false);assert.deepEqual(events.map(event=>event.type),['login-url','login-complete']);assert(!JSON.stringify(events).includes('private@example.test'));
});
test('Cursor status is local and never returns keys or sends inference',async()=>{
 const events:any[]=[];await cursorOperation({}, {operation:'status',credentials:{apiKey:'secret-fixture',apiKeyExpiresAtMs:1}},'/private',event=>events.push(event),new AbortController().signal);
 assert.deepEqual(events,[{type:'status',loggedIn:false,authMethod:'none'}]);assert(!JSON.stringify(events).includes('secret-fixture'));
});
test('Cursor closes the agent and does not emit failed or canceled turn results',async()=>{
 for(const status of ['finished','error','cancelled']){
  const events:any[]=[];let closed=false;
  const sdk={Agent:{create:async()=>({send:async()=>({wait:async()=>({status,result:'{"text":"Done","calls":[]}'})}),close:()=>{closed=true;}})}};
  const operation=cursorOperation(sdk,{operation:'turn',key:'fixture',model:'chosen',context:'{"system":"Scoped"}'},'/private',event=>events.push(event),new AbortController().signal);
  if(status==='finished')await operation;else await assert.rejects(operation);
  assert(closed);assert.equal(events.length,status==='finished'?1:0);
 }
});
test('Cursor requires an explicit SDK model object before creating an agent',()=>{
 assert.throws(()=>cursorOptions({operation:'turn',key:'fixture',context:'{"system":"Scoped"}'},'/private'),/explicit Cursor model/);
});
test('Cursor model discovery uses the SDK, narrow key and no inference',async()=>{
 const events:any[]=[];let options:any;
 const sdk={Cursor:{models:{list:async(value:any)=>{options=value;return [{id:'exact-fixture',displayName:'Exact'}];}}}};
 await cursorOperation(sdk,{operation:'models',credentials:{apiKey:'fixture',apiKeyExpiresAtMs:Date.now()+10000}},'/private',event=>events.push(event),new AbortController().signal);
 assert.equal(options.apiKey,'fixture');assert.deepEqual(events,[{type:'models',models:[{id:'exact-fixture',displayName:'Exact'}]}]);
});
