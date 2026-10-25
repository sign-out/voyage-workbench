const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {buildSync}=require('esbuild');
const output=fs.mkdtempSync(path.resolve('.build-tools/chat-popup-'));app.setPath('userData',path.join(output,'profile'));
buildSync({entryPoints:['hosts/desktop/chat-panel.ts'],outfile:path.join(output,'panel.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'});
const {createChatPanel}=require(path.join(output,'panel.cjs'));
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const handlers=new Map();
const requests=[];
app.on('web-contents-created',(_event,contents)=>{const original=contents.setWindowOpenHandler.bind(contents);contents.setWindowOpenHandler=handler=>{handlers.set(contents,handler);original(handler);};});
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:900,height:700});
 try{
  await session.fromPartition('persist:voyage-chatgpt-panel').protocol.handle('https',async request=>{requests.push({url:request.url,method:request.method,referrer:request.headers.get('referer'),contentType:request.headers.get('content-type'),body:await request.text()});return new Response('<!doctype html><p>Popup fixture</p><a id="signin" href="https://auth.openai.com/linked" referrerpolicy="no-referrer">Open sign-in</a><form action="https://auth.openai.com/submitted" method="post" target="_blank"><input name="fixture" value="safe"><button>Submit</button></form>',{headers:{'content-type':'text/html'}});});
  const controller=createChatPanel(window),bounds={x:0,y:0,width:800,height:600};controller.request('chatPanelShow',bounds);
  const view=window.contentView.children.find(child=>child.webContents&&child.webContents!==window.webContents);
  view.webContents.setBackgroundThrottling(false);
  for(let attempt=0;attempt<100&&view.webContents.isLoading();attempt++)await pause(20);
  await view.webContents.executeJavaScript(`setTimeout(()=>window.open('https://auth.openai.com/'),100);true`);
  controller.request('chatPanelHide');
  for(let attempt=0;attempt<100&&!controller.request('chatPanelDiagnostics').events.some(event=>event.event==='popup-blocked-hidden');attempt++)await pause(20);
  assert.equal(BrowserWindow.getAllWindows().length,1,'Hidden chat must reject delayed popup requests');
  assert.ok(controller.request('chatPanelDiagnostics').events.some(event=>event.event==='popup-blocked-hidden'));
  controller.request('chatPanelShow',bounds);
  const request=handlers.get(view.webContents)({url:'https://auth.openai.com/'});assert.equal(request.action,'allow');
  controller.request('chatPanelHide');controller.request('chatPanelShow',bounds);
  const late=request.createWindow(request.overrideBrowserWindowOptions),lateWindow=BrowserWindow.fromWebContents(late);
  assert.equal(lateWindow.isVisible(),false);lateWindow.emit('ready-to-show');await pause(20);
  assert.equal(lateWindow.isDestroyed(),true,'Popup from a previous panel generation must be destroyed, even after reopening');
  await view.webContents.executeJavaScript(`window.receivedPopup=false;window.addEventListener('message',event=>{if(event.origin==='https://auth.openai.com'&&event.data==='fixture-popup-ready')window.receivedPopup=true;});void window.open('https://auth.openai.com/');`);
  let popup;
  for(let attempt=0;attempt<100;attempt++){popup=BrowserWindow.getAllWindows().find(candidate=>candidate!==window);if(popup?.isVisible())break;await pause(20);}
  assert.ok(popup?.isVisible(),'Visible chat must still open allowed sign-in popups');
  assert.equal(popup.webContents.session,view.webContents.session);
  assert.equal(popup.webContents.getLastWebPreferences().nodeIntegration,false);
  assert.equal(popup.webContents.getLastWebPreferences().contextIsolation,true);assert.equal(popup.webContents.getLastWebPreferences().sandbox,true);assert.ok(!popup.webContents.getLastWebPreferences().preload);
  await popup.webContents.executeJavaScript(`window.opener?.postMessage('fixture-popup-ready','https://chatgpt.com');true`);
  for(let attempt=0;attempt<50&&!await view.webContents.executeJavaScript('window.receivedPopup');attempt++)await pause(20);
  assert.equal(await view.webContents.executeJavaScript('window.receivedPopup'),true,'Sign-in popup must retain opener communication');
  await popup.webContents.executeJavaScript(`window.onbeforeunload=()=>false;true`);
  controller.request('chatPanelHide');assert.equal(popup.isDestroyed(),true,'Hide must not be canceled by popup beforeunload');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  window.show();window.focus();controller.request('chatPanelShow',bounds);await pause(150);
  const point=await view.webContents.executeJavaScript(`(()=>{const box=document.querySelector('#signin').getBoundingClientRect();return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)};})()`);
  for(const input of [{button:'middle'},{button:'left',modifiers:['control']}]){
   view.webContents.focus();await pause(50);
   view.webContents.sendInputEvent({type:'mouseMove',...point});
   view.webContents.sendInputEvent({type:'mouseDown',...point,...input,clickCount:1});
   view.webContents.sendInputEvent({type:'mouseUp',...point,...input,clickCount:1});
   for(let attempt=0;attempt<100;attempt++){popup=BrowserWindow.getAllWindows().find(candidate=>candidate!==window);if(popup?.isVisible()&&popup.webContents.getURL()==='https://auth.openai.com/linked')break;await pause(20);}
   assert.ok(popup?.isVisible(),'Modified link click must show its destination: '+JSON.stringify({input,windows:BrowserWindow.getAllWindows().map(candidate=>({visible:candidate.isVisible(),url:candidate.webContents.getURL()})),events:controller.request('chatPanelDiagnostics').events.slice(-8)}));assert.equal(popup.webContents.getURL(),'https://auth.openai.com/linked');
   assert.equal(requests.filter(request=>request.url==='https://auth.openai.com/linked').at(-1).referrer,null,'Link referrer policy must be preserved');
   popup.destroy();
  }
  await view.webContents.executeJavaScript(`document.querySelector('form').requestSubmit();true`);
  for(let attempt=0;attempt<100&&!requests.some(request=>request.url==='https://auth.openai.com/submitted');attempt++)await pause(20);
  const submitted=requests.find(request=>request.url==='https://auth.openai.com/submitted');
  assert.ok(submitted);assert.equal(submitted.method,'POST');assert.equal(submitted.body,'fixture=safe');assert.match(submitted.contentType,/application\/x-www-form-urlencoded/);
  controller.request('chatPanelHide');assert.equal(BrowserWindow.getAllWindows().length,1);
  console.log('PASS: hidden/stale popups blocked; opener, modified links, referrer policy and form POST preserved; hide defeats beforeunload');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{window.destroy();app.exit(process.exitCode||0);}
});
setTimeout(()=>app.exit(1),15000).unref();
