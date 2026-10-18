import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('assistant keeps controls reachable and transcript independently scrollable on small viewports',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-assistant-layout-'));
 try{
  const viewport=readFileSync(path.resolve('apps/workbench/index.html'),'utf8').match(/<meta name="viewport"[^>]*>/)?.[0];
  assert.ok(viewport?.includes('interactive-widget=resizes-content'));
  assert.match(readFileSync(path.resolve('android/app/src/main/AndroidManifest.xml'),'utf8'),/android:windowSoftInputMode="adjustResize"/);
  const bundle=await build({stdin:{contents:`
   import React from 'react';
   import {createRoot} from 'react-dom/client';
   import {ContextualAssistant} from './ContextualAssistant';
   import {create} from '../../../packages/core/project';
   const root=createRoot(document.getElementById('root'));
   window.renderAssistant=(state)=>{
    const project=create('layout','World','{}',1);
    const longText='Long message '+('unbroken-provider-error-and-world-reference'.repeat(50)+'\\n').repeat(10);
    project.chat=state==='empty'?[]:Array.from({length:12},(_,index)=>({role:index%2?'assistant':'user',text:longText}));
    project.tasks=state==='empty'?[]:[{id:'task',kind:state==='proposal'?'work':'plan',state:state==='running'?'RUNNING':state==='proposal'?'PROPOSAL_READY':'FAILED',error:longText,reply:longText,localApplyBlockedReason:longText}];
    if(state==='proposal')project.artworkProposals=[{id:'artwork'}];
    root.render(<ContextualAssistant key={state} project={project} focus={{screen:'artwork',label:'Artwork '+longText,path:['world','description'],hasUnappliedEdits:state!=='empty'}} includeBuilderNotes onReceive={()=>{}} onReview={()=>{}}/>);
   };
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser'});
  const styles=['style.css','adaptive.css'].map(file=>readFileSync(path.resolve('apps/workbench/src',file),'utf8')).join('\n');
  const safeStyles=styles.replaceAll('env(safe-area-inset-top)','24px').replaceAll('env(safe-area-inset-bottom)','20px').replaceAll('env(safe-area-inset-left)','12px').replaceAll('env(safe-area-inset-right)','12px');
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html>${viewport}<style>${styles}</style><div class="adaptive-app"><div id="root"></div></div><script>${bundle.outputFiles[0].text}</script>`);
  writeFileSync(path.join(directory,'check.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{
    const window=new BrowserWindow({show:false,width:412,height:892,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    try{
     await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});
     for(const [width,height,safe] of [[412,892],[412,480],[412,400],[320,400],[760,550],[1280,900],[412,892,true],[412,400,true]]){
      window.webContents.enableDeviceEmulation({screenPosition:'mobile',screenSize:{width,height},viewSize:{width,height},deviceScaleFactor:1,scale:1});
      await new Promise(resolve=>setTimeout(resolve,50));
      const viewport=await window.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})');
      if(viewport.width!==width||viewport.height!==height)throw Error('Incorrect test viewport: '+JSON.stringify(viewport));
      await window.webContents.executeJavaScript('document.querySelector("style").textContent='+JSON.stringify(safe?${JSON.stringify(safeStyles)}:${JSON.stringify(styles)}));
      await window.webContents.executeJavaScript('window.layoutSafeArea='+!!safe);
      await window.webContents.executeJavaScript(LAYOUT_CHECK);
     }
    }finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `.replace('LAYOUT_CHECK',JSON.stringify(`(async()=>{
   const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
   for(const state of ['empty','failed','running','proposal','help']){
    window.renderAssistant(state);await settle();
    document.querySelector('.assistant-toggle').click();await settle();
    if(state==='help'){document.querySelector('.assistant-help').open=true;await settle();}
    const panel=document.querySelector('.contextual-assistant'),section=panel.querySelector('section'),thread=panel.querySelector('.assistant-thread'),composer=panel.querySelector('textarea');
    const bounds=element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,height:rect.height};};
    const check=(condition,message)=>{if(!condition)throw Error(state+' '+innerWidth+'x'+innerHeight+': '+message);};
    const panelBounds=bounds(panel),composerBounds=bounds(composer),threadBounds=bounds(thread);
    check(panelBounds.top>=0&&panelBounds.bottom<=innerHeight,'panel outside vertical viewport');
    check(panelBounds.left>=0&&panelBounds.right<=innerWidth,'panel outside horizontal viewport');
    if(window.layoutSafeArea)check(panelBounds.top>=24&&panelBounds.bottom<=innerHeight-20&&panelBounds.left>=12&&panelBounds.right<=innerWidth-12,'panel enters safe area');
    check(panel.scrollHeight<=panel.clientHeight+1,'outer panel must not scroll');
    check(document.documentElement.scrollWidth<=innerWidth,'page overflows horizontally');
    check(threadBounds.height>=(innerHeight<=600?24:40),'transcript has no usable height: '+threadBounds.height);
    check(composerBounds.bottom<=panelBounds.bottom,'composer clipped');
    const actions=[...panel.querySelectorAll('.button-row button')].map(button=>button.textContent);
    check(actions.includes('Send to assistant')&&actions.includes('Review suggestions')&&actions.some(text=>state==='proposal'?text.startsWith('Review artwork requests'):text==='Open artwork'),'missing assistant actions');
    if(state==='running')check(actions.includes('Stop task'),'missing stop control');
    if(state==='help'){
     const help=panel.querySelector('.assistant-help');
     check(help.scrollHeight>help.clientHeight,'expanded help must scroll');
     help.scrollTop=50;check(help.scrollTop>0,'expanded help cannot scroll');
    }
    const children=[...section.children];
    const visibleChildren=children.filter(element=>getComputedStyle(element).display!=='none');
    for(let index=1;index<visibleChildren.length;index++)check(bounds(visibleChildren[index]).top>=bounds(visibleChildren[index-1]).bottom-1,'section children overlap');
    for(const button of panel.querySelectorAll('button')){
     button.scrollIntoView({block:'nearest',inline:'nearest'});
     const rect=bounds(button);
     check(rect.top>=panelBounds.top&&rect.bottom<=panelBounds.bottom,'action clipped');
     check(rect.left>=panelBounds.left&&rect.right<=panelBounds.right,'action overflows');
     const notice=button.closest('.alert,.feature-status');
     if(notice)check(rect.top>=bounds(notice).top&&rect.bottom<=bounds(notice).bottom,'notice action clipped');
     check(button.contains(document.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2)),'action obscured');
    }
    if(state!=='empty'){
     check(thread.scrollHeight>thread.clientHeight,'long transcript must scroll');
     thread.scrollTop=0;thread.scrollTop=100;
     check(thread.scrollTop>0,'transcript cannot scroll');
     check(bounds(composer).top===composerBounds.top&&bounds(panel).top===panelBounds.top,'transcript scroll moves controls');
     const notice=[...panel.querySelectorAll('.alert,.feature-status')].find(element=>element.scrollHeight>element.clientHeight);
     if(state!=='running')check(!!notice,'long notice must be independently scrollable');
     if(notice){notice.scrollTop=50;check(notice.scrollTop>0,'notice cannot scroll');}
    }
    if(innerWidth===412&&innerHeight===892)check(panelBounds.height<=600,'phone panel takes too much viewport');
   }
  })()`)));
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'check.cjs')],{env:environment,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
