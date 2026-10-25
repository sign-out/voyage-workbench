const {app,BrowserWindow,session,Menu}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {buildSync}=require('esbuild');
const output=fs.mkdtempSync(path.resolve('.build-tools/chat-context-menu-'));app.setPath('userData',path.join(output,'profile'));
buildSync({entryPoints:['hosts/desktop/chat-panel.ts'],outfile:path.join(output,'panel.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'});
buildSync({entryPoints:['hosts/desktop/edit-context-menu.ts'],outfile:path.join(output,'menus.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'});
const {createChatPanel}=require(path.join(output,'panel.cjs'));
const {installEditContextMenu}=require(path.join(output,'menus.cjs'));
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:900,height:700});
 try{
  await session.fromPartition('persist:voyage-chatgpt-panel').protocol.handle('https',()=>new Response('<!doctype html><textarea>Test plan</textarea><button id="ask">Ask ChatGPT</button><button id="copy">Copy</button><p>Ask ChatGPT</p><script>window.menuOpened=false;document.addEventListener("contextmenu",()=>{window.menuOpened=true;});</script>',{headers:{'content-type':'text/html'}}));
  const controller=createChatPanel(window);controller.request('chatPanelShow',{x:0,y:0,width:800,height:600});
  const view=window.contentView.children.find(child=>child.webContents&&child.webContents!==window.webContents);
  installEditContextMenu(window.webContents);
  let menu;Menu.prototype.popup=function(){menu=this;};
  for(const contents of [window.webContents,view.webContents]){
   const called=[];const copy=contents.copy;contents.copy=()=>called.push(contents.id);
   const params={isEditable:true,formControlType:'input-text',editFlags:{canUndo:true,canRedo:false,canCut:true,canCopy:true,canPaste:true,canSelectAll:true}};
   contents.emit('context-menu',{},params);
   assert.deepEqual(menu.items.filter(item=>item.type!=='separator').map(item=>item.label),['Undo','Redo','Cut','Copy','Paste','Select All']);
   menu.items.find(item=>item.label==='Copy').click();assert.deepEqual(called,[contents.id]);
   contents.emit('context-menu',{},{...params,formControlType:'input-password'});
   assert.equal(menu.items.find(item=>item.label==='Copy').enabled,false);assert.equal(menu.items.find(item=>item.label==='Cut').enabled,false);
   contents.copy=copy;
  }
  async function check(expected){
   for(let attempt=0;attempt<100;attempt++){
    if(!view.webContents.isLoading()&&await view.webContents.executeJavaScript('!!document.querySelector("textarea")'))break;
    await pause(20);
   }
   await pause(50);
   const result=await view.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');input.focus();window.menuOpened=false;const allowed=input.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));input.select();return {allowed,opened:window.menuOpened,selected:input.selectionEnd-input.selectionStart,bridge:typeof window.voyage,node:typeof process};})()`);
   assert.equal(result.allowed,true);assert.equal(result.opened,!expected);assert.equal(result.selected,9);assert.equal(result.bridge,'undefined');assert.equal(result.node,'undefined');
   assert.equal(await view.webContents.executeJavaScript('getComputedStyle(document.querySelector("#ask")).display==="none"'),expected);
   await view.webContents.executeJavaScript(`(()=>{document.querySelector('#dynamic')?.remove();const control=document.createElement('div');control.id='dynamic';control.setAttribute('role','menuitem');control.innerHTML='<span>Ask ChatGPT</span>';document.body.append(control);})()`);
   await pause(20);
   assert.equal(await view.webContents.executeJavaScript('getComputedStyle(document.querySelector("#dynamic")).display==="none"'),expected);
   assert.equal(await view.webContents.executeJavaScript('getComputedStyle(document.querySelector("#copy")).display!=="none"&&getComputedStyle(document.querySelector("p")).display!=="none"'),true);
   await view.webContents.executeJavaScript(`document.querySelector('#dynamic').textContent='Copy';`);
   await pause(20);
   assert.equal(await view.webContents.executeJavaScript('getComputedStyle(document.querySelector("#dynamic")).display!=="none"'),true);
  }
  await check(true);
  window.show();window.focus();await pause(200);
  async function rightClick(contents){
   menu=undefined;contents.focus();await pause(100);
   contents.sendInputEvent({type:'mouseMove',x:20,y:20});
   contents.sendInputEvent({type:'mouseDown',x:20,y:20,button:'right',clickCount:1});
   contents.sendInputEvent({type:'mouseUp',x:20,y:20,button:'right',clickCount:1});
   for(let attempt=0;attempt<50&&!menu;attempt++)await pause(20);
   assert.ok(menu,'A real right click must open the native editing menu');
   assert.ok(menu.items.some(item=>item.label==='Paste'));assert.ok(!menu.items.some(item=>item.label==='Ask ChatGPT'));
  }
  await rightClick(view.webContents);
  controller.request('chatPanelHide');
  await window.webContents.loadURL('data:text/html,<textarea>Local plan</textarea>');
  await rightClick(window.webContents);
  controller.request('chatPanelShow',{x:0,y:0,width:800,height:600});
  controller.request('chatPanelReload');await check(true);
  controller.request('chatPanelHide');controller.request('chatPanelShow',{x:0,y:0,width:800,height:600});await check(true);
  await view.webContents.loadURL('https://auth.openai.com/');await check(false);
  await view.webContents.loadURL('https://chatgpt.com/');await check(true);
  console.log('PASS: standard edit menus target local/remote contents, protect passwords; Ask ChatGPT hidden without blocking native context menus');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{window.destroy();app.exit(process.exitCode||0);}
});
setTimeout(()=>app.exit(1),15000).unref();
