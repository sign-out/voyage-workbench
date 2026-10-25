const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {buildSync}=require('esbuild');
const output=fs.mkdtempSync(path.resolve('.build-tools/chat-recovery-'));app.setPath('userData',path.join(output,'profile'));
buildSync({entryPoints:['hosts/desktop/chat-panel.ts'],outfile:path.join(output,'panel.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'});
const {createChatPanel}=require(path.join(output,'panel.cjs'));
const actualTimeout=global.setTimeout;global.setTimeout=(handler,delay,...args)=>actualTimeout(handler,delay===25000?100:delay,...args);
const pause=milliseconds=>new Promise(resolve=>actualTimeout(resolve,milliseconds));
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:900,height:700});
 try{
  const controller=createChatPanel(window);controller.request('chatPanelShow',{x:0,y:0,width:800,height:600});
  const view=window.contentView.children.find(child=>child.webContents&&child.webContents!==window.webContents);
  let pending;
  view.webContents.session.webRequest.onBeforeRequest({urls:['https://chatgpt.com/*']},(_details,callback)=>{pending=callback;});
  for(let attempt=0;attempt<30&&!controller.request('chatPanelStatus').stalled;attempt++)await pause(100);
  assert.equal(controller.request('chatPanelStatus').stalled,true);assert.equal(view.getVisible(),false);
  controller.request('chatPanelShow',{x:0,y:0,width:700,height:500});assert.equal(view.getVisible(),false);
  assert.ok(controller.request('chatPanelDiagnostics').events.some(event=>event.event==='navigation-timeout'));
  controller.request('chatPanelHide');assert.equal(controller.request('chatPanelStatus').visible,false);
  if(pending)pending({cancel:true});
  console.log('PASS: stalled loading hides native page, records safe diagnostics, survives resize, and closes');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{window.destroy();app.exit(process.exitCode||0);}
});
actualTimeout(()=>app.exit(1),10000).unref();
