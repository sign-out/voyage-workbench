import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('actual raster maps share edge geometry and creation controls prepare publication details without implicit generation',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-creation-render-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React,{useState} from 'react';
   import {createRoot} from 'react-dom/client';
   import {WorldCreationWorkspace} from './WorldCreationWorkspace';
   import {renderCreationRegion} from './creation-execution';
   import {creationMapSvg} from '../../../packages/core/creation-map';
   import {project as fixture} from '../../../tests/creation-fixture';
   import {reduce} from '../../../packages/core/project';
   import {defaultSettings} from '../../../packages/core/providers';
   let project=fixture();const storage={};window.calls=[];window.publishedDetails=false;
   window.confirm=()=>true;
   window.voyage={invoke:async(method,payload={})=>{
    window.calls.push(method);
    if(method==='providerSettings')return {settings:defaultSettings()};
    if(method==='orchestrationCapabilities')return {delegation:false,checkpointResume:false};
    if(method==='featureGet')return storage[payload.key]||'';
    if(method==='featureSet'){if(payload.expected!==storage[payload.key]&&payload.expected!=='')throw Error('Unexpected feature revision');storage[payload.key]=payload.value;return {};}
    if(method==='project')return {project};
    if(method==='command'){project=reduce(project,payload.command);return {project};}
    if(method==='startAgent'){project=reduce(project,{type:'prepareTask',kind:'work',id:'build',attempt:'attempt',route:{protocol:'openai',model:'fixture'},hostPlatform:'desktop'});project=reduce(project,{type:'taskRunning',taskId:'build',attempt:'attempt'});return {project};}
    if(method==='stopAgent'){project=reduce(project,{type:'taskStop',taskId:'build',attempt:'attempt'});return {project};}
    throw Error('Unexpected method '+method);
   }};
   function Screen(){const [current,setCurrent]=useState(project);const receive=result=>setCurrent(result.project);return <WorldCreationWorkspace project={current} references={[]} command={async command=>{const result=await window.voyage.invoke('command',{command});receive(result);return result;}} receive={receive} onNew={async()=>{}} onReview={()=>{}} onPublish={()=>{window.publishedDetails=true;}}/>;}
   createRoot(document.getElementById('root')).render(<Screen/>);
   window.details=()=>JSON.parse(JSON.parse(storage['creation-details:project']));
   window.rasterCheck=async()=>{
    const project=fixture(),source=JSON.parse(project.activeSource);source.regions.east={name:'East',realm:'realm',x:1,y:0,images:{map:{imageUrl:''}}};project.activeSource=JSON.stringify(source);
    project.creation.maps[0].columns=2;project.creation.maps[0].features[0].points=[[0,0],[2,0],[2,1],[0,1]];
    project.creation.maps[0].features.push({id:'crossing-road',kind:'road',points:[[.2,.5],[1.8,.5]]});
    project.creation.maps[0].features.push({id:'seam-forest',kind:'forest',points:[[.7,.1],[1.3,.1],[1.3,.3],[.7,.3]]},{id:'seam-mountain',kind:'mountain',points:[[1,.7]]});
    const left=await renderCreationRegion(project.activeSource,project,'region'),right=await renderCreationRegion(project.activeSource,project,'east');
    async function pixels(dataUrl){const image=new Image();image.src=dataUrl;await image.decode();if(image.naturalWidth!==1000||image.naturalHeight!==1000)throw Error('Wrong region dimensions');const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1000;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context;}
    const first=await pixels(left),second=await pixels(right),image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(creationMapSvg(project.creation.maps[0]));await image.decode();
    const full=document.createElement('canvas');full.width=2000;full.height=1000;const whole=full.getContext('2d');whole.drawImage(image,0,0);
    for(const vertical of [100,135,200,299,497,500,503,675,700,735,900])for(const horizontal of [5,300,975,994,999]){
     if(JSON.stringify([...first.getImageData(horizontal,vertical,1,1).data])!==JSON.stringify([...whole.getImageData(horizontal,vertical,1,1).data]))throw Error('West map differs from global atlas at '+horizontal+','+vertical);
     const local=999-horizontal;if(JSON.stringify([...second.getImageData(local,vertical,1,1).data])!==JSON.stringify([...whole.getImageData(1000+local,vertical,1,1).data]))throw Error('East map differs from global atlas at '+local+','+vertical);
    }
    return {left:left.slice(0,22),right:right.slice(0,22)};
   };
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false});
  writeFileSync(path.join(directory,'app.js'),bundle.outputFiles[0].contents);writeFileSync(path.join(directory,'index.html'),'<div id="root"></div><script src="app.js"></script>');
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require(${JSON.stringify(path.resolve('node_modules/electron'))});
   app.disableHardwareAcceleration();app.whenReady().then(async()=>{
    const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:false,nodeIntegration:false}});
    try{await window.loadFile(${JSON.stringify(path.join(directory,'index.html'))});await window.webContents.executeJavaScript(\`(async()=>{
     const wait=async predicate=>{for(let attempt=0;attempt<200;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Creation UI condition timed out');};
     const button=text=>[...document.querySelectorAll('button')].find(button=>button.textContent===text);
     await wait(()=>button('Prepare title, blurb and cover in Publish'));
     if(window.calls.includes('imageGenerate')||window.calls.includes('startAgent'))throw Error('Render generated implicitly');
     button('Prepare title, blurb and cover in Publish').click();await wait(()=>window.publishedDetails);
     if(window.details().title!=='The Island Ferry'||!window.details().description.includes('island'))throw Error('Publication copy was not prepared correctly');
     const maps=await window.rasterCheck();if(maps.left!=='data:image/png;base64,'||maps.right!=='data:image/png;base64,')throw Error('Maps were not rasterized');
     await wait(()=>!button('Build world, maps and publishing package').disabled);
     button('Build world, maps and publishing package').click();await wait(()=>window.calls.includes('startAgent'));
     await wait(()=>!button('Stop assistant').disabled);button('Stop assistant').click();await wait(()=>window.calls.includes('stopAgent'));
     if(window.calls.includes('imageGenerate'))throw Error('Unapproved paid image request');
    })()\`);}finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
