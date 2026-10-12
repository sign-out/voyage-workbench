import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleConnectorRefresh,connectorRefreshDelay,connectorStatusMethods} from './connector-refresh';

function clock(){let callback=()=>{},cleared=false,delay=0;return {timers:{set:(next:()=>void,ms:number)=>{callback=next;delay=ms;return 7;},clear:(timer:number)=>{assert.equal(timer,7);cleared=true;}},fire:()=>{if(!cleared)callback();},delay:()=>delay};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('startup refresh waits briefly and only reads connector status',async()=>{
 const timer=clock(),requests:string[]=[],results:string[]=[];
 scheduleConnectorRefresh(async method=>{requests.push(method);return method;},(method,result)=>{assert.equal(result,method);results.push(method);},()=>assert.fail(),timer.timers);
 assert.equal(timer.delay(),connectorRefreshDelay);assert.equal(connectorRefreshDelay,1200);assert.deepEqual(requests,[]);
 timer.fire();await settle();assert.deepEqual(requests,['auth','connection','providerSettings']);assert.deepEqual(results,[...connectorStatusMethods]);
});
test('one failed status does not prevent the remaining refreshes',async()=>{
 const timer=clock(),results:string[]=[],failures:string[]=[];
 scheduleConnectorRefresh(async method=>{if(method==='auth')throw 'unavailable';return {};},method=>results.push(method),(method,error)=>{assert.equal(error.message,'unavailable');failures.push(method);},timer.timers);
 timer.fire();await settle();assert.deepEqual(results,['connection','providerSettings']);assert.deepEqual(failures,['auth']);
});
test('cleanup cancels pending refresh and ignores in-flight results and errors',async()=>{
 const timer=clock(),requests:string[]=[];
 const cancel=scheduleConnectorRefresh(async method=>requests.push(method),()=>assert.fail(),()=>assert.fail(),timer.timers);
 cancel();timer.fire();await settle();assert.deepEqual(requests,[]);
 const inFlight=clock();let resolveAuth:(value:any)=>void=()=>{},rejectConnection:(error:Error)=>void=()=>{};
 const cleanup=scheduleConnectorRefresh(method=>method==='auth'?new Promise(resolve=>resolveAuth=resolve):method==='connection'?new Promise((resolve,reject)=>rejectConnection=reject):Promise.resolve({}),()=>assert.fail(),()=>assert.fail(),inFlight.timers);
 inFlight.fire();await Promise.resolve();cleanup();resolveAuth({});rejectConnection(new Error('late'));await settle();
});
