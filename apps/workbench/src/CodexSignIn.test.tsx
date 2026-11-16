import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('Codex sign-in UI reuses one login, monitors it locally, clears finished codes and never retries a session limit or signs out automatically',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-codex-sign-in-ui-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';import {CodexSignIn} from './CodexSignIn';
   window.calls=[];window.signedIn=false;window.loginState=null;window.startMode='waiting';window.confirm=()=>true;
   window.voyage={invoke:async(method,payload)=>{window.calls.push({method,payload});
    if(method==='auth')return {available:true,account:window.signedIn?{type:'chatgpt',email:'fixture@example.invalid'}:null,login:window.loginState};
    if(method==='loginStatus')return window.loginState;
    if(method==='login'){const attempt='attempt-'+window.calls.filter(call=>call.method==='login').length;window.loginState=window.startMode==='limit'?{attempt,state:'failed',error:'Codex active session limit reached'}:{attempt,state:'waiting',loginId:'login-'+attempt,verificationUrl:'https://auth.openai.com/codex/device',userCode:'TEST-1234'};return window.loginState;}
    if(method==='loginCancel'){if(payload.attempt===window.loginState.attempt)window.loginState={attempt:payload.attempt,state:'canceled'};return window.loginState;}
    if(['copyText','openExternal'].includes(method))return {};
    if(method==='logout'){window.signedIn=false;window.loginState=null;return {};}
    if(method==='useCliLogin'){window.signedIn=true;return {available:true,account:{type:'chatgpt'},login:null};}
    throw Error('Unexpected action '+method);
   }};
   const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(<CodexSignIn/>);
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  writeFileSync(path.join(directory,'fixture.html'),'<div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>');
  const inspect=`(async()=>{
   const check=(value,message)=>{if(!value)throw Error(message);},text=()=>document.body.innerText;
   const button=label=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent===label);
   const wait=async(condition)=>{for(let attempt=0;attempt<300;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Sign-in UI timed out: '+text());};
   const count=method=>window.calls.filter(call=>call.method===method).length;
   await wait(()=>button('Sign in to Codex')&&!button('Sign in to Codex').disabled);check(count('login')===0,'Opening Connection requested a new login');
   button('Sign in to Codex').click();await wait(()=>text().includes('TEST-1234'));check(button('Sign in to Codex').disabled,'Pending flow permits another login');
   button('Sign in to Codex').click();window.dispatchEvent(new Event('focus'));await wait(()=>count('loginStatus')>0);check(count('login')===1,'Status monitoring requested a new code');
   button('Copy code').click();button('Open Codex sign-in page').click();await wait(()=>count('openExternal')===1);check(window.calls.find(call=>call.method==='copyText').payload.text==='TEST-1234','Copy lost the active code');check(window.calls.find(call=>call.method==='openExternal').payload.url==='https://auth.openai.com/codex/device','Wrong sign-in destination');
   window.signedIn=true;window.loginState={attempt:'attempt-1',state:'complete'};window.dispatchEvent(new Event('focus'));await wait(()=>text().includes('fixture@example.invalid'));check(!text().includes('TEST-1234'),'Completed sign-in left a stale code');check(button('Sign in to Codex').disabled,'Signed-in users are invited to allocate another session');check(count('login')===1,'Completion requested another login');
   window.signedIn=false;window.loginState=null;button('Refresh status').click();await wait(()=>!button('Sign in to Codex').disabled);button('Sign in to Codex').click();await wait(()=>text().includes('TEST-1234'));button('Cancel this sign-in').click();await wait(()=>text().includes('Sign-in canceled'));check(!text().includes('TEST-1234'),'Canceled flow left a stale code');check(count('logout')===0,'Cancel revoked saved account auth');check(window.calls.find(call=>call.method==='loginCancel').payload.attempt==='attempt-2','Cancel did not bind its attempt');
   window.startMode='limit';await wait(()=>!button('Sign in to Codex').disabled);button('Sign in to Codex').click();await wait(()=>text().includes('active session limit reached'));const starts=count('login');window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,1100));check(count('login')===starts,'Session limit automatically retried sign-in');check(count('logout')===0,'Session limit automatically logged out');check(!text().includes('TEST-1234'),'Session-limit response revived a stale code');
   window.signedIn=true;button('Refresh status').click();await wait(()=>text().includes('fixture@example.invalid'));check(!document.querySelector('[role="alert"]'),'A previous session-limit response is still presented as a current sign-in failure');
   window.signedIn=false;window.loginState=null;button('Refresh status').click();await wait(()=>!button('Reuse existing CLI login').disabled);button('Reuse existing CLI login').click();await wait(()=>text().includes('Signed in'));check(count('useCliLogin')===1&&count('login')===starts,'Reusing CLI credentials allocated another session');check(button('Reuse existing CLI login').disabled,'A working credential cache can be repeatedly overwritten');
   const calls=count('loginStatus');window.unmount();window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,1100));check(count('loginStatus')===calls,'Unmounted screen kept polling');
   check(window.calls.every(call=>['auth','login','loginStatus','loginCancel','copyText','openExternal','useCliLogin'].includes(call.method)),'Sign-in flow started inference or a remote world action');
  })()`;
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{const window=new BrowserWindow({show:false,width:390,height:760,webPreferences:{contextIsolation:true,backgroundThrottling:false}});try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(inspect)});}finally{window.destroy();}}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:25000});assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
