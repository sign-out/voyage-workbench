import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('114 characters remain reachable in a separate scrollport across desktop, short windows and phones',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-character-scroll-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import {LegacyView} from './LegacyViews';import {create} from '../../../packages/core/project';
   import {charactersInspect} from '../../../packages/core/features';
   const npcs=Object.fromEntries(Array.from({length:114},(_,index)=>['person-'+index,{name:'Character '+index,description:'A named character with enough description to span several lines in the sidebar.',visualDescription:'A blue coat.',backstory:'A long history. '.repeat(200)}]));
   const project=create('scroll','Scroll fixture',JSON.stringify({npcs}),1);
   window.voyage={invoke:async(method)=>{if(method==='references')return {sections:[]};throw Error('Unexpected request '+method);}};
   createRoot(document.getElementById('root')).render(<div className="app adaptive-app"><main className="workspace"><header><h1>Characters</h1></header><nav className="workspace-tools">Navigation</nav><LegacyView kind="characters" project={project} compute={async(method,text)=>{if(method==='charactersInspect')return charactersInspect(text,[]);throw Error(method);}} apply={async()=>{throw Error('Scrolling must not edit the world');}}/><footer>Workbench</footer></main></div>);
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'}});
  const styles=['web/character-explorer.css','apps/workbench/src/style.css','apps/workbench/src/adaptive.css'].map(file=>readFileSync(file,'utf8')).join('\n');
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
  const inspect=`(async()=>{
   const check=(condition,message)=>{if(!condition)throw Error(innerWidth+' × '+innerHeight+': '+message);};
   const wait=async(condition)=>{for(let attempt=0;attempt<300;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Characters did not render');};
   await wait(()=>document.querySelectorAll('.ce-card').length===114);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const list=document.querySelector('.ce-cards'),editor=document.querySelector('.ce-editor'),toolbar=document.querySelector('.ce-toolbar'),header=document.querySelector('header');
   const toolbarTop=toolbar.getBoundingClientRect().top,headerTop=header.getBoundingClientRect().top;
   check(list.clientHeight>80&&list.scrollHeight>list.clientHeight,'character list grew instead of scrolling');
   check(list.getBoundingClientRect().bottom<=document.querySelector('footer').getBoundingClientRect().top+1,'character list extends behind the footer');
   check(list.tabIndex===0&&list.getAttribute('role')==='region','character list is not keyboard-accessible');
   check(list.offsetWidth-list.clientWidth>2,'no visible scrollbar gutter');
   list.scrollTop=list.scrollHeight;await new Promise(resolve=>requestAnimationFrame(resolve));
   check(list.scrollTop>0,'character list cannot scroll');
   const last=list.lastElementChild.getBoundingClientRect(),bounds=list.getBoundingClientRect();
   check(last.bottom<=bounds.bottom+1&&last.top>=bounds.top,'last character is unreachable');
   check(toolbar.getBoundingClientRect().top===toolbarTop&&header.getBoundingClientRect().top===headerTop,'scrolling the list moved its toolbar or header');
   list.lastElementChild.click();await wait(()=>document.querySelector('.ce-editor h3')?.textContent==='Character 113');
   check(editor.scrollHeight>editor.clientHeight,'character details do not have an independent scrollport');
   editor.scrollTop=editor.scrollHeight;check(editor.scrollTop>0,'long character details cannot scroll');
   if(innerWidth>=761)check(list.getBoundingClientRect().right<=editor.getBoundingClientRect().left,'desktop list and editor no longer sit side by side');
   else{const back=[...editor.querySelectorAll('button')].find(button=>button.textContent==='← All characters');back.click();await wait(()=>!document.querySelector('.ce-panel').classList.contains('is-editing'));check(list.clientHeight>80&&list.scrollHeight>list.clientHeight,'returning to the phone list lost its scrollport');}
   check(document.documentElement.scrollWidth<=innerWidth,'character explorer overflows horizontally');
  })()`;
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{for(const [width,height] of [[1920,1080],[960,540],[400,850]]){const window=new BrowserWindow({show:false,width,height,webPreferences:{contextIsolation:true,backgroundThrottling:false}});try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(inspect)});}finally{window.destroy();}}}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:45000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
