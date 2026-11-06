import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('rendered portrait workflow previews real saved bytes, targets the correct character and reports request stages safely',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-artwork-usability-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React from 'react';
   import {createRoot} from 'react-dom/client';
   import {ArtworkWorkspace} from './ArtworkWorkspace';
   import {create} from '../../../packages/core/project';
   import {defaultSettings} from '../../../packages/core/providers';
   import {charactersInspect} from '../../../packages/core/features';
   import {initCharacterExplorer} from '../../../web/character-explorer.js';
   const root=createRoot(document.getElementById('root'));
   const project=create('portraits','Fixture world',JSON.stringify({title:'Fixture world',initialGameState:{npcs:{guide:{name:'Guide',visualDescription:'Blue cloak and silver hair'}},premadeCharacters:[{name:'Hero',visualDescription:'Red cloak'}]}}),1);
   const guideId=JSON.stringify(['initialGameState','npcs','guide','portraitUrl']),heroId=JSON.stringify(['initialGameState','premadeCharacters',0,'portraitUrl']);
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;canvas.getContext('2d').fillRect(0,0,128,128);const image=canvas.toDataURL('image/png');
   window.confirmations=[];window.confirm=message=>{window.confirmations.push(message);return window.consent!==false;};
   window.calls=[];window.applies=0;window.imageCalls=0;window.originalSource=project.activeSource;
   const settings=defaultSettings();settings.profiles[0].name='Codex CLI fixture';settings.profiles[0].model='vision-fixture';settings.routes.artwork={profileId:settings.profiles[0].id,model:''};
   const store=new Map();window.store=store;
   store.set('asset:guide-image',JSON.stringify({id:'guide-image',name:'Guide portrait',created:1,prompt:'Guide brief',dataUrl:image}));
   store.set('asset:hero-image',JSON.stringify({id:'hero-image',name:'Hero portrait',created:1,prompt:'Hero brief',dataUrl:image}));
   store.set('artwork-studio:portraits',JSON.stringify([
    {id:'guide-job',created:3,destination:'Guide',destinationId:guideId,prompt:'Guide brief',state:'generated',assetId:'guide-image'},
    {id:'hero-job',created:2,destination:'Hero',destinationId:heroId,prompt:'Hero brief',state:'generated',assetId:'hero-image'},
    {id:'missing-job',created:1,destination:'Missing portrait',destinationId:guideId,prompt:'Missing brief',state:'generated',assetId:'missing-image'},
    {id:'removed-job',created:0,destination:'Removed character',destinationId:'removed-character',prompt:'Old brief',state:'generated',assetId:'guide-image'}
   ]));
   window.voyage={invoke:async(method,payload)=>{
    window.calls.push(method);
    if(method==='providerSettings')return {settings};
    if(method==='featureGet')return store.get(payload.key)||null;
    if(method==='featureSet'){
     if('expected' in payload&&payload.expected!==(store.get(payload.key)||null))throw Error('This feature changed');
     if(window.deferSave&&payload.key.startsWith('asset:'))await new Promise(resolve=>window.finishSave=resolve);
     store.set(payload.key,payload.value);
     if(window.driftRoute&&payload.key==='artwork-studio:portraits'){settings.profiles[0].model='changed-model';window.driftRoute=false;}
     return {};
    }
    if(method==='imageGenerate'){
     window.imageCalls++;window.lastImageRequest=payload;
     if(JSON.parse(store.get('artwork-studio:portraits'))[0].state!=='generating')throw Error('Image called without a durable journal');
     return new Promise((resolve,reject)=>window.finishGeneration=error=>error?reject(Error(error)):resolve({dataUrl:image,route:payload.route}));
    }
    throw Error('Unexpected provider, upload or world mutation: '+method);
   }};
   window.mountArtwork=(id=guideId)=>root.render(<ArtworkWorkspace key={crypto.randomUUID()} project={project} initialDestinationId={id} apply={async()=>{window.applies++;throw Error('Artwork must not auto-attach');}} onCover={()=>{throw Error('Portrait must not open cover');}}/>);
   window.mountCharacters=async()=>{
    root.render(<div/>);await new Promise(resolve=>setTimeout(resolve,30));
    const host=document.createElement('div');document.body.append(host);window.characterHost=host;
    const node=(tag,text,cls)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;};
    const explorer=initCharacterExplorer({host,node,api:async()=>charactersInspect(project.activeSource,[]),getSource:()=>project.activeSource,getProject:()=>project,applyText:async()=>{window.applies++;},status:message=>window.characterStatus=message,onArtwork:selection=>{window.characterSelection=selection;host.remove();window.mountArtwork(JSON.stringify(selection.path.concat('portraitUrl')));}});
    await explorer.render();
   };
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  const styles=['apps/workbench/src/style.css','apps/workbench/src/adaptive.css','web/character-explorer.css'].map(file=>readFileSync(file,'utf8')).join('\n');
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div class="adaptive-app"><div id="root"></div></div><script>${bundle.outputFiles[0].text}</script>`);
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{
    const window=new BrowserWindow({show:false,width:400,height:850,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(`(async()=>{
     const check=(condition,message)=>{if(!condition)throw Error(message);};
     const wait=async(condition)=>{for(let attempt=0;attempt<400;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Artwork timed out: '+document.body.innerText);};
     const settle=()=>new Promise(resolve=>setTimeout(resolve,60));
     const button=text=>{const element=[...document.querySelectorAll('button')].find(element=>element.textContent===text);if(!element)throw Error('Missing button: '+text);return element;};
     const heading=()=>document.querySelector('.artwork-destination-editor h3')?.textContent;
     window.mountArtwork();await wait(()=>heading()==='Guide'&&document.querySelectorAll('.artwork-history-card img').length===3);
     await wait(()=>[...document.querySelectorAll('.artwork-history-card img')].every(image=>image.naturalWidth===128));
     check(document.body.innerText.includes('Saved image bytes are missing'),'Missing assets were silently hidden');
     check(window.imageCalls===0&&window.applies===0,'Opening review generated or attached an image');
     document.querySelector('[aria-label="Inspect Guide generated artwork full size"]').click();await wait(()=>document.querySelector('dialog[open]'));
     check(document.querySelector('dialog img').src.startsWith('data:image/png;base64,'),'Inspection did not show actual saved bytes');
     document.querySelector('[aria-label="Close image inspection"]').click();await settle();
     button('Select saved artwork for Hero').click();await wait(()=>heading()==='Hero'&&document.querySelector('.artwork-preview-pair img'));
     check(document.querySelector('[aria-label="Artwork brief"]').value==='Hero brief','Saved image retained the previous character brief');
     check(document.documentElement.scrollWidth<=innerWidth,'Artwork gallery overflows phone width');
     button('Select saved artwork for Removed character').click();await wait(()=>document.body.innerText.includes('original artwork destination is missing'));
     check(heading()==='Hero','Removed destination silently assigned artwork to another character');
     window.deferSave=true;
     button('Generate artwork locally').click();await wait(()=>window.imageCalls===1);
     check(document.querySelector('[aria-label="Artwork generation progress"]').innerText.includes('Generating artwork for Hero'),'Missing target-specific generating feedback');
     check(document.body.innerText.includes('Codex CLI fixture · vision-fixture'),'Missing provider/model feedback');
     check(window.confirmations.at(-1).includes('Hero')&&window.confirmations.at(-1).includes('may incur charges'),'Confirmation omitted the target or charge scope');
     check(window.lastImageRequest.prompt==='Hero brief'&&!JSON.stringify(window.lastImageRequest).includes('initialGameState'),'Generation sent the full world instead of the brief');
     const generatingButton=[...document.querySelectorAll('button')].find(element=>element.textContent==='Generating for Hero…');
     check(generatingButton?.disabled,'Generation was not disabled while running');generatingButton.click();check(window.imageCalls===1,'Duplicate generation was allowed');
     window.finishGeneration();await wait(()=>window.finishSave);
     check(document.querySelector('[aria-label="Artwork generation progress"]').innerText.includes('Saving generated image locally for Hero'),'Missing save-stage feedback');
     window.deferSave=false;window.finishSave();await wait(()=>document.body.innerText.includes('Artwork for Hero is ready to review'));
     check(!document.querySelector('[aria-label="Artwork generation progress"]'),'Progress did not finish');
     check(JSON.parse(window.store.get('artwork-studio:portraits'))[0].provider==='Codex CLI fixture','History omitted the generating provider');
     check(window.applies===0,'Generation attached an image without approval');
     window.consent=false;button('Generate artwork locally').click();await settle();check(window.imageCalls===1,'Cancelled confirmation generated an image');
     window.consent=true;button('Generate artwork locally').click();await wait(()=>window.imageCalls===2);window.finishGeneration('Fixture disconnected');
     await wait(()=>document.body.innerText.includes('Hero: The provider may have completed this request. No automatic retry.'));
     check(JSON.parse(window.store.get('artwork-studio:portraits'))[0].state==='uncertain','Failure did not preserve uncertain outcome');await settle();check(window.imageCalls===2,'Failed image was automatically retried');
     window.driftRoute=true;button('Generate artwork locally').click();await wait(()=>document.body.innerText.includes('No image request was sent. The Artwork provider or model changed'));
     check(window.imageCalls===2,'Provider drift sent an unapproved image request');
     await window.mountCharacters();document.querySelector('[aria-label="Edit Guide"]').click();await wait(()=>document.querySelector('[aria-label="Generate artwork for Guide"]'));
     const description=document.querySelector('textarea[aria-label="visual Description"]');check(description,'Character description field missing');description.value='Unsaved appearance';description.dispatchEvent(new Event('input',{bubbles:true}));
     document.querySelector('[aria-label="Generate artwork for Guide"]').click();await wait(()=>window.characterStatus?.includes('Apply or discard'));
     check(!window.characterSelection,'Dirty character form navigated to generation');button('Discard edits').click();document.querySelector('[aria-label="Generate artwork for Guide"]').click();await wait(()=>heading()==='Guide');
     check(JSON.stringify(window.characterSelection.path)==='["initialGameState","npcs","guide"]','Character shortcut used the wrong exact path');
     check(document.querySelector('[aria-label="Artwork brief"]').value.includes('Blue cloak and silver hair'),'Character appearance was not included in the prepared brief');
     check(window.imageCalls===2&&window.applies===0,'Portrait shortcut silently generated or mutated the world');
    })()`)});}finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:70000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
