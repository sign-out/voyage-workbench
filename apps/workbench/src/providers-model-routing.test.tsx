import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('rendered connections preserve routes through CLI discovery, refresh races and setup checks',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-provider-models-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React from 'react';
   import {createRoot} from 'react-dom/client';
   import {Providers} from './Providers';
   import {defaultSettings} from '../../../packages/core/providers';
   const root=createRoot(document.getElementById('root'));
   window.mountProviders=()=>{
    let settings=defaultSettings();settings.profiles[0].model='saved-pin';settings.routes.artwork={profileId:'codex',model:'saved-artwork-pin'};
    window.pendingCatalogs=[];window.savedSettings=[];window.setupChecks=0;window.generationCalls=0;
    window.voyage={invoke:async(method,payload)=>{
     if(method==='providerSettings')return {settings:structuredClone(settings)};
     if(method==='providerModels')return new Promise((resolve,reject)=>window.pendingCatalogs.push({resolve,reject}));
     if(method==='saveProviderSettings'){settings=structuredClone(payload.settings);window.savedSettings.push(settings);return {settings};}
     if(method==='providerImageStatus'){window.setupChecks++;return {detail:'CLI setup checked. No generation was requested.'};}
     if(method==='imageGenerate'){window.generationCalls++;throw Error('Rendering cannot generate');}
     throw Error('Unexpected request '+method);
    }};
    root.render(<Providers key={Math.random()}/>);
   };
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  const styles=['style.css','adaptive.css'].map(file=>readFileSync(path.resolve('apps/workbench/src',file),'utf8')).join('\n');
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div class="adaptive-app"><div id="root"></div></div><script>${bundle.outputFiles[0].text}</script>`);
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{
    const window=new BrowserWindow({show:false,width:400,height:800,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(`(async()=>{
     const wait=async(check)=>{for(let attempt=0;attempt<300;attempt++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Connections timed out: '+document.body.innerText);};
     const settle=()=>new Promise(resolve=>setTimeout(resolve,50));
     const check=(condition,message)=>{if(!condition)throw Error(message);};
     const select=label=>document.querySelector('select[aria-label="'+label+'"]');
     const change=(element,value)=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));};
     const button=text=>[...document.querySelectorAll('button')].find(element=>element.textContent===text);
     const catalog=id=>[{id,inputModalities:['text','image'],isDefault:true},{id:'text-only',inputModalities:['text']}];
     window.mountProviders();await wait(()=>window.pendingCatalogs.length===1);
     check(window.savedSettings.length===0&&window.generationCalls===0,'Discovery persisted settings or generated an image');
     check(select('artwork model selection').value==='__custom__','Saved artwork override was dropped');
     check(document.querySelector('input[aria-label="artwork model"]').value==='saved-artwork-pin','Saved ID was rewritten');
     check(!document.body.innerText.includes('GPT-6.1-Sol'),'Codex guessed an unavailable model');
     button('Refresh models').click();await wait(()=>window.pendingCatalogs.length===2);
     window.pendingCatalogs[1].resolve(catalog('fresh-vision'));await wait(()=>[...select('artwork model selection').options].some(option=>option.value==='fresh-vision'));
     window.pendingCatalogs[0].resolve(catalog('stale-vision'));await settle();
     check(![...select('artwork model selection').options].some(option=>option.value==='stale-vision'),'Slow initial discovery overwrote explicit refresh');
     check(![...select('artwork model selection').options].some(option=>option.value==='text-only'),'Text-only model was offered for CLI artwork');
     check([...select('planning model selection').options].some(option=>option.value==='text-only'),'Text-only models disappeared from text stages');
     change(select('artwork model selection'),'fresh-vision');await settle();
     button('Save & check Codex image setup (no generation)').click();await wait(()=>window.setupChecks===1);
     check(window.savedSettings.at(-1).routes.artwork.model==='fresh-vision','Setup checked a different saved route');
     check(window.generationCalls===0,'Setup started generation');
     check(document.documentElement.scrollWidth<=innerWidth,'Connections overflow on a narrow viewport');
     window.mountProviders();await wait(()=>window.pendingCatalogs.length===1);
     change(select('Provider type codex'),'openai');await settle();window.pendingCatalogs[0].resolve(catalog('late-cli-model'));await settle();
     check(![...select('Default model codex selection').options].some(option=>option.value==='late-cli-model'),'CLI response leaked into a changed provider');
     window.mountProviders();await wait(()=>window.pendingCatalogs.length===1);window.pendingCatalogs[0].reject(Error('Fixture CLI offline'));await wait(()=>document.body.innerText.includes('Fixture CLI offline'));
     check(document.querySelector('input[aria-label="artwork model"]').value==='saved-artwork-pin','Discovery failure erased a saved ID');
     check(window.savedSettings.length===0&&window.generationCalls===0,'Failed discovery persisted or generated');
    })()`)});}finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
