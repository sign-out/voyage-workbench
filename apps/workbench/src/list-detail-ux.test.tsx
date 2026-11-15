import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('large libraries and system lists keep details reachable, creation can scroll and short asset dialogs keep Close available',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-list-detail-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';
   import {AssetLibrary,AssetPicker} from './AssetLibrary';import {MusicEditor,SystemsEditor} from './StudioEditors';import {WorldCreationWorkspace} from './WorldCreationWorkspace';
   import {create,hash} from '../../../packages/core/project';import {createWorkspace} from '../../../packages/core/world-creation';import {defaultSettings} from '../../../packages/core/providers';
   const tracks=Object.fromEntries(Array.from({length:100},(_,index)=>['Track '+index,{notes:'A long soundtrack direction. '.repeat(100),variants:[]}]));
   const systems=Object.fromEntries(Array.from({length:40},(_,index)=>['system'+index,{description:'Mechanics guidance. '.repeat(100)}]));
   const project=create('fixture','World',JSON.stringify({gameplayMusicSettings:{tracks},...systems}),1);
   project.creation=createWorkspace({id:'creation',brief:'Make an island world from the supplied notes.',documents:[{id:'notes',name:'notes.md',text:'# Notes\\nAn island port and a lighthouse.'}]},hash);
   let assets=Array.from({length:90},(_,index)=>({id:'asset'+index,name:'Artwork '+index,kind:'image',mime:'image/png',aliases:[],tags:[],remote:[],created:1}));
   window.calls=[];window.confirmations=0;window.confirm=()=>{window.confirmations++;return window.acceptDiscard!==false;};window.voyage={invoke:async(method,payload)=>{window.calls.push(method);if(method==='featureGet')return payload.key==='asset-library'?JSON.stringify(assets):null;if(method==='featureSet'){if(payload.key!=='asset-library'||payload.expected!==JSON.stringify(assets))throw Error('Unexpected library write');assets=JSON.parse(payload.value);return {};}if(method==='providerSettings')return {settings:defaultSettings()};if(method==='orchestrationCapabilities')return {checkpointResume:false,delegation:false};throw Error('Unexpected operation '+method);}};
   const root=createRoot(document.getElementById('root')),props={project,command:async()=>{throw Error('Browsing must not edit');},receive:()=>{},onReview:()=>{}};
   window.mount=screen=>root.render(<div className="app adaptive-app"><main className="workspace"><header><h1>{screen}</h1></header><nav className="workspace-tools">Navigation</nav>{screen==='assets'?<AssetLibrary {...props}/>:screen==='music'?<MusicEditor {...props}/>:['systems','systems-draft'].includes(screen)?<SystemsEditor {...props} project={screen==='systems-draft'?{...project,draft:{path:['system39'],text:JSON.stringify({description:'Saved mechanics draft'}),baseHash:hash(project.activeSource)}}:project} references={Object.keys(systems).map(section=>({section,title:section,summary:'Rules',tab:'mechanics',schema:{_type:'required',fields:{description:'string'}}}))}/>:screen==='creation'?<section className="creation-workspace-host"><WorldCreationWorkspace {...props} references={[]} onPublish={()=>{}} onNew={async()=>{}}/></section>:<AssetPicker kind="image" project={project} onChoose={async()=>{throw Error('Browsing must not attach');}} onClose={()=>{window.closed=true;}}/>}<footer>Workbench</footer></main></div>);
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'}});
  const styles=['apps/workbench/src/style.css','apps/workbench/src/adaptive.css','apps/workbench/src/studio.css'].map(file=>readFileSync(file,'utf8')).join('\n');
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
  const inspect=`(async()=>{
   const issues=[],check=(condition,message)=>{if(!condition)issues.push(innerWidth+' × '+innerHeight+': '+message);};
   const wait=async(condition)=>{for(let attempt=0;attempt<300;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Screen did not load: '+document.body.innerText);};
   const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   for(const screen of ['assets','music','systems']){
    window.mount(screen);await wait(()=>document.querySelectorAll('.library-layout .library-row').length>20);await settle();
    const layout=document.querySelector('.library-layout'),list=layout.children[0];check(list.scrollHeight>list.clientHeight&&list.clientHeight>40,screen+' list has no independent scrollport');
    list.scrollTop=list.scrollHeight;const rows=list.querySelectorAll('.library-row');rows[rows.length-1].click();await wait(()=>layout.children[1].querySelector('h3'));await settle();
    const detail=layout.children[1];
    if(screen==='assets'){
     const field=label=>[...detail.querySelectorAll('label')].find(node=>node.textContent.startsWith(label)).querySelector('input'),write=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
     const before=detail.querySelector('h3').textContent;write(field('Library name'),'Unsaved library name');await settle();window.acceptDiscard=false;
     if(innerWidth<761)detail.querySelector('.list-detail-back').click();else rows[rows.length-2].click();await settle();
     check(detail.querySelector('h3').textContent===before&&field('Library name').value==='Unsaved library name','changing assets discarded unapproved library edits');
     write(field('Library name'),'  Renamed artwork  ');write(field('Tags'),'blue, blue, gold');await settle();[...detail.querySelectorAll('button')].find(button=>button.textContent==='Save library details').click();
     await wait(()=>detail.querySelector('h3').textContent==='Renamed artwork'&&field('Library name').value==='Renamed artwork'&&field('Tags').value==='blue, gold');window.confirmations=0;
    }
    check(getComputedStyle(detail).overflowY==='auto'&&detail.clientHeight<=layout.clientHeight,screen+' details have no independent scrollport');
    if(innerWidth<761){check(getComputedStyle(list).display==='none',screen+' leaves the whole list ahead of selected details on phones');const back=detail.querySelector('.list-detail-back');check(!!back,screen+' has no way back to the list');if(back){back.click();await settle();check(getComputedStyle(list).display!=='none',screen+' cannot return to its list');if(screen==='assets')check(window.confirmations===0,'saved library normalization prompted for nonexistent unsaved edits');}}
    check(document.documentElement.scrollWidth<=innerWidth,screen+' overflows horizontally');
   }
   window.mount('creation');await wait(()=>document.querySelector('.world-creation'));await settle();const page=document.querySelector('.world-creation');check(page.scrollHeight>page.clientHeight,'Create World form expands behind the clipped workspace');page.scrollTop=page.scrollHeight;check(page.scrollTop>0,'Create World cannot scroll to delivery controls');
   window.mount('systems-draft');await wait(()=>document.querySelector('.list-detail-editor h3')?.textContent==='system39');check([...document.querySelectorAll('.list-detail-editor textarea')].some(field=>field.value==='Saved mechanics draft'),'saved mechanics draft could not be resumed');check(document.querySelector('.list-detail-back').disabled,'saved mechanics draft can be hidden without review or discard');
   window.mount('picker');await wait(()=>document.querySelector('dialog[open] .library-picker-list button'));await settle();const dialog=document.querySelector('dialog[open]');dialog.scrollTop=dialog.scrollHeight;await settle();const header=dialog.querySelector('header'),close=header.querySelector('button'),r=close.getBoundingClientRect();check(header.getBoundingClientRect().top>=dialog.getBoundingClientRect().top-1,'asset-picker Close scrolls out of its dialog');check(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===close,'asset-picker Close is clipped or covered');
   check(!window.calls.some(method=>['imageGenerate','creatorRequest','command'].includes(method)),'Browsing performed generation, upload or edits');
   if(issues.length)throw Error(issues.join('\\n'));
  })()`;
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});app.whenReady().then(async()=>{for(const [width,height] of [[1280,800],[400,720],[844,390]]){const window=new BrowserWindow({show:false,width,height,webPreferences:{contextIsolation:true,backgroundThrottling:false}});try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(inspect)});}finally{window.destroy();}}}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:70000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
