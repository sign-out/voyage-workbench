import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('rendered import workflow refreshes stale comparisons, preserves whole runtime categories and applies only selected world changes',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-import-workflow-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React,{useState} from 'react';
   import {createRoot} from 'react-dom/client';
   import {ImportReview} from './ImportReview';
   import {create,reduce,hash} from '../../../packages/core/project';
   import * as doc from '../../../packages/core/document';
   import {readImportReview} from '../../../packages/core/world-import';
   const triggers=Object.fromEntries(Array.from({length:17},(_,index)=>['Trigger '+index,{instructions:'Old wording '+index}]));
   const generated=Object.fromEntries(Array.from({length:200},(_,index)=>['__generated_quest_progress__/Quest '+index,{instructions:'Generated '+index}]));
   const before=JSON.stringify({title:'Current title',shortId:'WORLD',initialGameState:{heroesVersion:37,characterCreationMusic:'fantasy',npcs:{Guide:{description:'Before'}},triggerDefinitions:triggers,parties:{'':{questTriggers:generated,entities:{Guide:{hp:12}}}}}});
   const incoming=JSON.stringify({heroesVersion:37,npcs:{Guide:{description:'<script>window.untrusted=true</script> '+'x'.repeat(12000)}},triggerDefinitions:Object.fromEntries(Object.entries(triggers).reverse().map(([key,value])=>[key,{instructions:value.instructions.replace('Old','New')}])),parties:{'':{questTriggers:{}}},worldVoices:{}});
   let saved=reduce(create('world','Fixture world',before,1),{type:'stage',id:'import',title:'Import world',kind:'import',source:incoming});
   window.confirmations=[];window.confirm=message=>{window.confirmations.push(message);return true;};window.requests=[];window.revision=1;
   let update;
   const dispatch=command=>{saved=reduce(saved,{...command,now:Date.now()});window.project=saved;window.revision++;update(saved);return {project:saved,revision:window.revision};};
   window.dispatch=dispatch;window.hash=hash;window.read=(...args)=>doc.read(...args);
   window.voyage={invoke:async(method,payload)=>{
    window.requests.push(method);
    if(method==='references')return {sections:[]};
    if(method==='export')return {saved:false};
    if(method==='startAgent'){
     dispatch({type:'prepareTask',id:'summary',attempt:'summary-attempt',kind:'plan',importReview:payload.importReview});
     dispatch({type:'taskRunning',taskId:'summary',attempt:'summary-attempt'});
     let offset=0;for(;;){const snapshot=saved.tasks[0].importReview,page=readImportReview(snapshot,offset);dispatch({type:'taskTool',taskId:'summary',attempt:'summary-attempt',callId:'page-'+offset,name:'world_import_review',args:{offset}});if(page.nextOffset===null)break;offset=page.nextOffset;}
     return dispatch({type:'taskDone',taskId:'summary',attempt:'summary-attempt',text:'17 trigger instructions and one character description change. Omitted generated state is kept.'});
    }
    throw Error('Unexpected network or provider request: '+method);
   }};
   const compute=async(method,...args)=>{if(method==='validate'){if(window.deferValidation)await new Promise(resolve=>window.finishValidation=resolve);window.validationMarker='CHECKED_SELECTION_'+hash(args[0]);return [...doc.validate(...args),{level:'warning',message:window.validationMarker}];}return doc[method](...args);};
   function Fixture(){const [project,setProject]=useState(saved);update=setProject;window.project=project;const candidate=project.candidates[0];return candidate?<ImportReview project={project} candidate={candidate} busy={false} running={false} compute={compute} command={async command=>dispatch(command)} onReceive={receipt=>setProject(receipt.project)} onAccept={async()=>dispatch({type:'accept',id:candidate.id})} onSelect={()=>{}}/>:<p>Import review closed</p>;}
   createRoot(document.getElementById('root')).render(<Fixture/>);
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  writeFileSync(path.join(directory,'fixture.html'),'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>');
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{const window=new BrowserWindow({show:false,width:400,height:850,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(`(async()=>{
     const check=(condition,message)=>{if(!condition)throw Error(message);};
     const wait=async condition=>{for(let attempt=0;attempt<500;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Import timed out: '+document.body.innerText);};
     const button=text=>{const element=[...document.querySelectorAll('button')].find(element=>element.textContent===text);if(!element)throw Error('Missing button: '+text);return element;};
     const click=async text=>{await wait(()=>[...document.querySelectorAll('button')].some(element=>element.textContent===text&&!element.disabled));button(text).click();};
     const select=(label,value)=>{const field=document.querySelector('[aria-label="'+label+'"]');field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));};
     const initial=window.project.activeSource;
     await wait(()=>document.body.innerText.includes('18 authored-world changes selected'));
     check(document.querySelector('[aria-label="Import behavior"]').value==='merge','Partial import did not default to merge');
     check(document.body.innerText.includes('omitted branches kept by Merge'),'Omissions were not explained as retained data');
     check(document.body.innerText.includes('Empty objects do not clear maps'),'Merge limitations were hidden');
     check(!window.untrusted&&document.querySelector('.after').textContent.includes('<script>'),'World text was executed or hidden instead of escaped');
     check(document.querySelector('.after').textContent.length<=1600,'Huge fields were not bounded');
     await click('Show full world-field values (preview truncated)');await wait(()=>document.querySelector('.after').textContent.length>12000);
     await click('Summarize world changes with assistant');await wait(()=>document.body.innerText.includes('17 trigger instructions and one character description change'));
     check(window.project.activeSource===initial,'Summary modified the world');
     await click('Keep current for this category');await wait(()=>document.body.innerText.includes('0 authored-world changes selected'));
     check(document.body.innerText.includes('earlier proposal/mode/selection'),'Changed selection did not mark the explanation stale');
     select('Import behavior','replace');await wait(()=>document.body.innerText.includes('201 runtime/generated'));
     select('World-change category','runtime');await wait(()=>document.querySelectorAll('.change').length===50);
     await click('Keep current for this category');await wait(()=>window.project.candidates[0].rejectedChanges.length===201);
     check(window.project.activeSource===initial,'Bulk selection applied content before acceptance');
     window.dispatch({type:'edit',path:['initialGameState','npcs','Guide','description'],source:JSON.stringify('Local latest'),baseHash:window.hash(window.project.activeSource)});
     await wait(()=>document.body.innerText.includes('comparison is refreshed'));
     check(button('Accept selected world changes').disabled,'A stale import can still be accepted');
     await click('Refresh comparison against current world');await wait(()=>!document.body.innerText.includes('comparison is refreshed')&&window.project.candidates[0].rejectedChanges.length===0);
     check(window.project.candidates[0].importOptions.mode==='replace','Refresh silently changed import mode');
     check(window.read(window.project.activeSource,['initialGameState','npcs','Guide','description'])===JSON.stringify('Local latest'),'Refresh modified the active world');
     await wait(()=>document.querySelector('[aria-label="World-change category"]'));await click('Keep current for this category');await wait(()=>window.project.candidates[0].rejectedChanges.length===201);
     await click('Export selected proposal');await wait(()=>document.body.innerText.includes('Export canceled'));
     window.deferValidation=true;await click('Check selected world');await wait(()=>window.finishValidation);
     window.dispatch({type:'importCategorySelection',id:'import',candidateHash:window.hash(window.project.candidates[0].source),category:'world',reject:true});
     window.finishValidation();await wait(()=>document.body.innerText.includes('0 authored-world changes selected')&&window.validationMarker);
     check(!document.body.innerText.includes(window.validationMarker),'Validation for an old selection remained authoritative');
     window.deferValidation=false;select('World-change category','structure');await wait(()=>document.querySelectorAll('.change').length===1);
     await click('Keep current for this category');await wait(()=>document.body.innerText.includes('No world-value changes are selected'));
     check(button('Accept selected world changes').disabled,'An unchanged selection was offered as a world edit');
     check(button('Summarize world changes with assistant').disabled,'No-op import encouraged spending provider quota');
     await click('Use imported for this category');await wait(()=>!button('Accept selected world changes').disabled);
     await click('Accept selected world changes');await wait(()=>document.body.innerText.includes('Import review closed'));
     check(window.read(window.project.activeSource,['initialGameState','npcs','Guide','description'])===JSON.stringify('Local latest'),'Kept local edits were overwritten');
     check(window.read(window.project.activeSource,['initialGameState','triggerDefinitions','Trigger 0','instructions'])===JSON.stringify('Old wording 0'),'Excluded trigger edits were applied');
     check(window.read(window.project.activeSource,['initialGameState','parties','','questTriggers','__generated_quest_progress__/Quest 199','instructions'])===JSON.stringify('Generated 199'),'Off-page runtime records were deleted');
     check(window.read(window.project.activeSource,['initialGameState','worldVoices'])==='{}','The one selected change was not applied');
     check(window.requests.filter(method=>method==='startAgent').length===1&&!window.requests.some(method=>/creator|upload|imageGenerate/.test(method)),'Review repeated provider calls or uploaded data');
    })()`)});}finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:70000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
