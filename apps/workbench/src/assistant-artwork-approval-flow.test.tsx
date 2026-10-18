import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('inline approvals generate only after clicks, support batches, and stop safely',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-inline-approval-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React from 'react';
   import {createRoot} from 'react-dom/client';
   import {AssistantArtworkApprovals} from './AssistantArtworkApprovals';
   import {create,hash} from '../../../packages/core/project';
   import {defaultSettings} from '../../../packages/core/providers';
   const root=createRoot(document.getElementById('root'));
   window.setupApproval=(mode)=>{
    const project=create('p','World','{"npcs":{"guide":{"name":"Guide"},"hero":{"name":"Hero"}}}',1);
    project.artworkProposals=['guide','hero'].map((key,index)=>({id:key,taskId:'planner',destinationId:JSON.stringify(['npcs',key,'portraitUrl']),prompt:'Portrait '+key,label:key,baseHash:hash(project.activeSource),created:1}));
    const settings=defaultSettings();settings.profiles.push({id:'images',name:'Fixture images',protocol:'openai',baseUrl:'https://images.example/v1',model:'text',imageModel:'image-model'});settings.routes.artwork={profileId:'images',model:''};
    const store={};window.imageCalls=0;window.pendingImages=[];
    window.voyage={invoke:async(method,payload)=>{
     if(method==='project')return {project};if(method==='providerSettings')return {settings};
     if(method==='featureGet')return store[payload.key]??null;
     if(method==='featureSet'){if('expected' in payload&&payload.expected!==(store[payload.key]??null))throw Error('This feature changed');store[payload.key]=payload.value;return {};}
     if(method==='imageGenerate'){window.imageCalls++;if(mode==='error')throw Error('Fixture connection lost');return new Promise(resolve=>window.pendingImages.push(()=>resolve({dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=',route:payload.route})));}
     throw Error('Unexpected host method '+method);
    }};
    window.historyRows=()=>JSON.parse(store['artwork-studio:p']||'[]');
    window.releaseImage=()=>window.pendingImages.shift()?.();
    window.remount=()=>root.render(<AssistantArtworkApprovals key={Math.random()} project={project} blocked={false} onArtwork={()=>{}}/>);
    window.changeRoute=()=>settings.routes.artwork.model='different-model';
    window.remount();
   };
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{
    const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(`(async()=>{
     const wait=async(check)=>{for(let attempt=0;attempt<200;attempt++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Approval UI timed out: '+document.body.innerText);};
     const button=(text)=>[...document.querySelectorAll('button')].find(item=>item.textContent===text);
     const check=(condition,message)=>{if(!condition)throw Error(message);};
     for(const mode of ['single','batch','stop','error','route']){
      window.setupApproval(mode);await wait(()=>button('Approve & generate 2 images')&&!button('Approve & generate 2 images').disabled);
      check(window.imageCalls===0,'Rendering must not generate');
      if(mode==='route')window.changeRoute();
      const approve=mode==='single'?button('Approve & generate for guide'):button('Approve & generate 2 images');
      approve.click();approve.click();
      if(mode==='route'){await wait(()=>document.body.innerText.includes('provider or model changed'));check(window.imageCalls===0,'Changed route must not incur usage');continue;}
      await wait(()=>window.imageCalls===1);
      if(mode==='error'){await wait(()=>document.body.innerText.includes('No automatic retry'));check(window.historyRows()[0].state==='uncertain','Failure must remain uncertain');}
      else{
       if(mode==='stop')button('Stop after current image').click();
       window.releaseImage();
       if(mode==='batch'){await wait(()=>window.imageCalls===2);window.releaseImage();}
       await wait(()=>!button('Stop after current image'));
       check(window.imageCalls===(mode==='batch'?2:1),'Duplicate click or stop replayed generation');
       check(window.historyRows().filter(item=>item.state==='generated').length===(mode==='batch'?2:1),'Generated history is missing');
      }
      const before=window.imageCalls;window.remount();await wait(()=>button('Refresh approvals'));
      await new Promise(resolve=>setTimeout(resolve,50));check(window.imageCalls===before,'Remount replayed generation');
      check(button('Approve & generate for guide').disabled,'Attempted request must stay disabled');
     }
    })()`)});}finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
