const {app}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'voyage-section-smoke-')));
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw new Error('No network call is authorized by this fixture.');};
const timeout=setTimeout(()=>{console.error('Section checkpoint smoke timed out');app.exit(1);},60000);
app.on('browser-window-created',(_event,window)=>window.webContents.once('did-finish-load',async()=>{
 try{
  const result=await window.webContents.executeJavaScript(`(async()=>{
   const source='{"title":"Before","aiInstructions":{},"exact":9007199254740993}';
   const created=await window.voyage.invoke('create',{name:'Section checkpoint fixture',source}),id=created.project.id;
   const command=(type,extra={})=>window.voyage.invoke('command',{id,command:{type,taskId:'section-task',attempt:'attempt',...extra}});
   await command('workOrder',{baseHash:await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)).then(bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')),order:{reviewedScope:true,objective:'Improve sections',requirements:[],allowedPaths:[],wholeWorld:true}});
   await command('prepareTask',{id:'section-task',kind:'work'});await command('taskRunning');
   await command('taskEdit',{action:'replace',path:['title'],source:'"After"'});
   const first=await command('taskSectionCheckpoint',{label:'Title',paths:[['title']]});
   await command('taskSectionCheckpoint',{label:'Title',paths:[['title']]});
   await command('taskEdit',{action:'replace',path:['aiInstructions'],source:'42'});
   const error=await command('taskSectionCheckpoint',{label:'Instructions',paths:[['aiInstructions']]}).then(()=>'',failure=>failure.message);
   const failed=await window.voyage.invoke('project',{id});
   const history=await window.voyage.invoke('exportHistory',{id});
   const receipt=first.project.tasks[0].sectionCheckpoints[0];
   const snapshot=await window.voyage.invoke('checkpointDetail',{id,checkpointId:receipt.id});
   await command('taskEdit',{action:'replace',path:['aiInstructions'],source:'{"story":{"tone":"Gentle"}}'});
   const fixed=await command('taskSectionCheckpoint',{label:'Instructions',paths:[['aiInstructions']]});
   return {error,failedCount:failed.project.tasks[0].sectionCheckpoints.length,failedSource:failed.project.tasks[0].stagedSource,activeSource:fixed.project.activeSource,source,firstHistoryCount:history.checkpoints.length,snapshot:snapshot.source,fixedCount:fixed.project.tasks[0].sectionCheckpoints.length,remoteOperations:fixed.project.remote.operations.length};
  })()`);
  assert.match(result.error,/Section checkpoint failed after checkpoint 1/);
  assert.equal(result.failedCount,1);assert.equal(result.fixedCount,2);assert.equal(result.firstHistoryCount,1);
  assert.match(result.failedSource,/"aiInstructions":42/);assert.match(result.snapshot,/"title":"After"/);assert.match(result.snapshot,/9007199254740993/);
  assert.equal(result.activeSource,result.source);assert.equal(result.remoteOperations,0);assert.equal(networkCalls,0);
  console.log(JSON.stringify({ok:true,durableSectionHistory:true,duplicateSafe:true,failedDraftPreserved:true,targetedCorrection:true,activeWorldUnchanged:true,networkCalls}));
  clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
}));
require('../build/desktop/main.cjs');
