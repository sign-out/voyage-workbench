import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('micro companion phone workflow imports world changes, shows save progress and exports exact data without full-app dependencies',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-sync-ui-'));
 try{
  await build({entryPoints:['apps/sync/main.ts'],bundle:true,platform:'browser',target:'chrome70',format:'iife',outfile:path.join(directory,'sync.js')});
  const html=readFileSync('apps/sync/index.html','utf8').replace('<script src="sync.js">','<script src="mock.js"></script><script src="sync.js">');writeFileSync(path.join(directory,'index.html'),html);copyFileSync('apps/sync/style.css',path.join(directory,'style.css'));
  writeFileSync(path.join(directory,'mock.js'),`
   window.nativeCalls=[];window.confirm=()=>true;window.persisted={format:1,revision:0,environment:'production'};
   const triggers=Object.fromEntries(Array.from({length:17},(_,index)=>['trigger-'+index,{description:'Before '+index}]));
   window.remoteSource='{"shortId":"WORLD","title":"Phone world","initialGameState":{"heroesVersion":37,"compatibilityRevision":9,"exact":90071992547409931234,"triggers":'+JSON.stringify(triggers)+',"parties":{"main":{"quests":{"keep":{"name":"Keep me"}}}}}}';
   const incoming=JSON.stringify({triggers:Object.fromEntries(Array.from({length:17},(_,index)=>['trigger-'+index,{description:'After '+index}]))});
   const persist=state=>{window.persisted={...state,revision:window.persisted.revision+1};return JSON.parse(JSON.stringify(window.persisted));};
   window.VoyageSyncNative={post:text=>{const call=JSON.parse(text);window.nativeCalls.push(call);setTimeout(()=>{try{const payload=call.payload;let result;
    if(call.method==='state')result=window.persisted;
    else if(call.method==='connection')result={environment:window.persisted.environment,connected:!!window.connected,apiBase:'https://api.aidungeon.com/creator/v1'};
    else if(call.method==='connect'){window.connected=!!payload.key;result={connected:window.connected};}
    else if(call.method==='commit')result=persist(payload.state);
    else if(call.method==='worlds')result={data:{worlds:Array.from({length:45},(_,index)=>({shortId:index===0?'WORLD':'other-'+index,title:index===0?'Phone world':index===44?'<img src=x onerror=alert(1)>':'A world with a very long readable name '+index}))}};
    else if(call.method==='readWorld')result={text:'{"data":{"world":'+window.remoteSource+'}}',etag:'"revision"'};
    else if(call.method==='pickFile')result={name:'Equestria_Beneath_One_Sky_Expanded_Skills_Abilities_'.repeat(3)+'.json',source:incoming};
    else if(call.method==='sendSave'){if(window.persisted.pending.state!=='prepared')throw Error('Save was not journaled');window.remoteSource=window.persisted.pending.payload.slice(9,-1);window.persisted.pending.state='acknowledged';result=persist(window.persisted);}
    else if(call.method==='readback'){window.persisted.pending.readback={text:'{"data":{"world":'+window.remoteSource+'}}',etag:'"next"'};result=persist(window.persisted);}
    else if(call.method==='resolveSave'){result=persist({...window.persisted,world:{id:'WORLD',source:payload.source,etag:payload.etag,environment:window.persisted.pending.environment},draft:undefined,pending:undefined,notice:'Saved and confirmed.'});}
    else if(call.method==='export'){window.exported=payload.source;result={saved:true};}
    else throw Error('Unexpected action '+call.method);
    window.VoyageSyncReply({id:call.id,result});
   }catch(error){window.VoyageSyncReply({id:call.id,error:error.message});}},call.method==='sendSave'?100:5);}};
  `);
  const inspect=`(async()=>{
   const check=(value,message)=>{if(!value)throw Error(message);};
   const wait=async(condition)=>{for(let attempt=0;attempt<400;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Sync UI timed out');};
   const ready=()=>!document.getElementById('import').disabled;
   await wait(ready);check(window.nativeCalls.every(call=>['state','connection'].includes(call.method)),'App opened a remote world in the background');
   document.getElementById('key').value='synthetic-test-key';document.getElementById('connect').click();await wait(()=>ready()&&window.connected);
   document.getElementById('list').click();await wait(()=>ready()&&document.querySelectorAll('#worlds button').length===45);
   check(!document.querySelector('img'),'Remote world names were interpreted as markup');
   const list=document.getElementById('worlds');check(list.scrollHeight>list.clientHeight,'Owned worlds are not independently scrollable');list.scrollTop=list.scrollHeight;check(list.scrollTop>0,'Last world is unreachable');list.scrollTop=0;list.querySelector('button').click();
   await wait(()=>ready()&&window.persisted.world);check(window.persisted.world.id==='WORLD','Wrong target world');
   document.getElementById('import').click();await wait(()=>ready()&&!document.getElementById('proposal').hidden);check(document.getElementById('summary').textContent.includes('17 world changes'),'Import shows file noise instead of world changes');check(window.nativeCalls.every(call=>call.method!=='sendSave'),'Import uploaded without approval');
   document.getElementById('accept').click();await wait(()=>ready()&&window.persisted.draft);check(window.persisted.draft.includes('90071992547409931234')&&window.persisted.draft.includes('Keep me'),'Import rounded an ID or removed omitted runtime');
   document.getElementById('save').click();await wait(()=>document.getElementById('feedback').textContent.includes('Validating'));check(document.getElementById('save').disabled,'Save progress permits duplicate clicks');
   await wait(()=>ready()&&!window.persisted.pending&&!window.persisted.draft);check(window.nativeCalls.filter(call=>call.method==='sendSave').length===1,'Save dispatched twice');check(window.remoteSource.includes('After 16'),'Updated world content was not saved');
   document.getElementById('export').click();await wait(()=>ready()&&window.exported);check(window.exported.includes('90071992547409931234')&&window.exported.includes('Keep me'),'Export lost exact data');
   check(document.documentElement.scrollWidth<=innerWidth,'Companion overflows the phone viewport');check(window.nativeCalls.every(call=>!/(provider|agent|generate|image)/i.test(call.method)),'Full-app functionality leaked into sync');
  })()`;
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{for(const [width,height] of [[360,640],[320,568]]){const window=new BrowserWindow({show:false,width,height,webPreferences:{contextIsolation:true,backgroundThrottling:false}});try{await window.loadFile(${JSON.stringify(path.join(directory,'index.html'))});await window.webContents.executeJavaScript(${JSON.stringify(inspect)});}finally{window.destroy();}}}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
