import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompatibilityStatus,ReleaseGuidance} from './CompatibilityStatus';
import {create,hash} from '../../../packages/core/project';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('status exposes local persistence, authored revision and unknown engine without claiming compatibility',()=>{
 const project=create('p','World','{"heroesVersion":37,"compatibilityRevision":9}',1);
 project.remote={environment:'alpha',worldId:'WORLD',baselineHash:hash(project.activeSource),etag:'revision',operations:[]};
 const html=renderToStaticMarkup(<CompatibilityStatus project={project} connection={{environment:'production'}}/>);
 assert.match(html,/matches last checked Voyage draft/);assert.match(html,/Compatibility revision/);assert.match(html,/>9</);assert.match(html,/Engine build/);assert.match(html,/Unknown/);assert.match(html,/World identity is shared/);assert.doesNotMatch(html,/project remains linked to alpha/);assert.match(html,/1000 × 1000/);
 const dirty=renderToStaticMarkup(<CompatibilityStatus project={project} dirty/>);assert.match(dirty,/Unsaved changes/);
});
test('production and beta guidance never borrow alpha publication limits',()=>{
 for(const environment of ['production','beta']){
  const project=create('p','World','{}',1);project.remote.worldId='WORLD';project.remote.environment=environment;
  const html=renderToStaticMarkup(<ReleaseGuidance project={project}/>);assert.match(html,/No release-specific publish caps/);assert.doesNotMatch(html,/350,000/);assert.match(html,/passing art grade does not override/);
  const status=renderToStaticMarkup(<CompatibilityStatus project={project} connection={{environment}}/>);
  assert.match(status,new RegExp('https://'+(environment==='beta'?'beta\\.':'')+'voyage\\.io/studio'));
  assert.match(status,environment==='beta'?/1280 × 720/:/1000 × 1000/);
 }
});
test('alpha guidance names provisional release limits and oversized media without truncation',()=>{
 const source=JSON.stringify({itemTypes:{book:{mediaContent:'x'.repeat(4001)}}}),project=create('p','World',source,1);project.remote.worldId='WORLD';project.remote.environment='alpha';
 const html=renderToStaticMarkup(<ReleaseGuidance project={project}/>);assert.match(html,/350,000/);assert.match(html,/4,000/);assert.match(html,/4001/);assert.match(html,/upstream counting is unverified/);assert.equal(project.activeSource,source);
});

test('engine feedback follows the selected connection, ignores stale results and visibly rechecks without mutations',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-engine-feedback-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
   import {WorldEngineNotice} from './CompatibilityStatus';import {create} from '../../../packages/core/project';
   const project=create('shared','Shared','{"heroesVersion":37,"compatibilityRevision":9}',1);project.remote.worldId='WORLD';project.remote.environment='production';
   window.calls=[];window.pending=[];
   window.voyage={invoke:async(method,payload)=>{window.calls.push({method,payload});if(method!=='worldEngine')throw Error('Unexpected mutation '+method);return new Promise(resolve=>window.pending.push(resolve));}};
   function Fixture(){const [environment,setEnvironment]=useState('alpha');window.selectConnection=setEnvironment;return <WorldEngineNotice project={project} connection={{environment,voyage:true}}/>;}
   createRoot(document.getElementById('root')).render(<Fixture/>);
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  writeFileSync(path.join(directory,'fixture.html'),'<div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>');
  const inspect=`(async()=>{
   const check=(value,message)=>{if(!value)throw Error(message);};
   const wait=async(condition)=>{for(let attempt=0;attempt<250;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Engine feedback timed out');};
   const status=(environment,warning='')=>({environment,worldId:'WORLD',checked:1,warning});
   await wait(()=>document.querySelector('button'));check(window.calls.length===0,'Opening the local project read the remote world');document.querySelector('button').click();await wait(()=>window.pending.length===1);check(document.getElementById('root').textContent.includes('Checking world engine on alpha'),'Initial check has no feedback');
   window.selectConnection('beta');await wait(()=>document.querySelector('button')?.textContent.includes('beta'));check(window.calls.length===1,'Switching connections opened the remote world');document.querySelector('button').click();await wait(()=>window.pending.length===2);check(document.getElementById('root').textContent.includes('Checking world engine on beta'),'Switch did not use selected connection');
   window.pending[0](status('alpha','Stale Alpha warning'));await new Promise(resolve=>setTimeout(resolve,20));check(!document.getElementById('root').textContent.includes('Stale Alpha'),'Stale connection result leaked');
   window.pending[1](status('beta'));await wait(()=>document.getElementById('root').textContent.includes('No newer engine version'));check(!document.getElementById('root').textContent.includes('Newer world engine'),'Host label alone generated a warning');
   window.selectConnection('alpha');await wait(()=>document.querySelector('button')?.textContent.includes('alpha'));await new Promise(resolve=>setTimeout(resolve,20));check(window.calls.length===2,'Returning to an earlier connection restarted an old inspection');
   window.selectConnection('production');await wait(()=>document.querySelector('button')?.textContent.includes('production'));document.querySelector('button').click();await wait(()=>window.pending.length===3);window.pending[2](status('production','World engine upgrade: V37 / revision 9 → V38 / revision 0.'));
   await wait(()=>document.getElementById('root').textContent.includes('Newer world engine'));check(document.querySelector('section').getAttribute('role')==='status','Expected upgrade is presented as an error');check(document.querySelector('a').href==='https://voyage.io/studio','Wrong Studio host');
   document.querySelector('button').click();await wait(()=>window.pending.length===4);check(document.getElementById('root').textContent.includes('Checking world engine on production'),'Recheck has no progress');
   window.pending[3](status('production'));await wait(()=>document.getElementById('root').textContent.includes('No newer engine version'));check(window.calls.length===4&&window.calls.every(call=>call.method==='worldEngine'),'Engine inspection triggered a mutation');
  })()`;
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,backgroundThrottling:false}});try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(inspect)});}finally{window.destroy();}}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
