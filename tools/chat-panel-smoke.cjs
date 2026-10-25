const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const output=path.resolve('.build-tools/chat-panel-qa');
fs.mkdirSync(output,{recursive:true});
const run=fs.mkdtempSync(path.join(output,'run-'));
app.setPath('userData',path.join(run,'profile'));
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const report={checks:[],remote:null};
const bounded=(promise)=>Promise.race([promise,new Promise((resolve)=>setTimeout(()=>resolve({timedOut:true}),4000))]);
require(path.resolve('build/desktop/main.cjs'));
app.whenReady().then(async()=>{
 try{
  let window;
  for(let attempt=0;attempt<100;attempt++){
   window=BrowserWindow.getAllWindows()[0];
   if(window&&!window.webContents.isLoading()&&await window.webContents.executeJavaScript('!!document.querySelector(".chatgpt-panel-launcher")'))break;
   await delay(200);
  }
  assert.ok(window,'Workbench window exists');
  await window.webContents.executeJavaScript('document.querySelector(".chatgpt-panel-launcher").click()');
  for(let attempt=0;attempt<100&&!window.contentView.children.some(view=>view.webContents&&view.webContents!==window.webContents);attempt++)await delay(100);
  const panel=window.contentView.children.find(view=>view.webContents&&view.webContents!==window.webContents);
  assert.ok(panel,'Embedded Chat view exists');
  const preferences=panel.webContents.getLastWebPreferences();
  assert.equal(preferences.nodeIntegration,false);assert.equal(preferences.contextIsolation,true);assert.equal(preferences.sandbox,true);assert.ok(!preferences.preload);
  assert.notEqual(panel.webContents.session,window.webContents.session);
  report.checks.push('separate session; sandbox; context isolation; no Node or privileged preload');
  let remoteFailure;
  panel.webContents.on('did-fail-load',(_event,code,_description,_url,main)=>{if(main&&code!==-3)remoteFailure=code;});
  for(let attempt=0;attempt<150;attempt++){
   if(remoteFailure||!panel.webContents.isLoading()&&panel.webContents.getURL().startsWith('https:'))break;
   await delay(200);
  }
  await delay(1500);
  const url=new URL(panel.webContents.getURL());
  report.remote={origin:url.origin,path:url.pathname,loading:panel.webContents.isLoading(),failure:remoteFailure??null};
  report.remote.page=await panel.webContents.executeJavaScript('({title:document.title,text:document.body?.innerText.slice(0,1800),bridge:typeof window.voyage,node:typeof process})');
  assert.equal(report.remote.page.bridge,'undefined');assert.equal(report.remote.page.node,'undefined');
  report.checks.push('remote page has no Voyage bridge or Node process');
  const screenshot=await window.webContents.capturePage();fs.writeFileSync(path.join(run,'panel.png'),screenshot.toPNG());
  const remoteScreenshot=await panel.webContents.capturePage();fs.writeFileSync(path.join(run,'chat-page.png'),remoteScreenshot.toPNG());
  if(process.env.VOYAGE_CHAT_PANEL_LOGIN_PROBE!=='1'){
  const denied=panel.webContents.getURL();
  await panel.webContents.executeJavaScript('location.href="https://example.com/"');await delay(500);
  assert.equal(panel.webContents.getURL(),denied);report.checks.push('unapproved top-level navigation blocked');
  await window.webContents.executeJavaScript('[...document.querySelectorAll(".chatgpt-panel button")].find(button=>button.textContent==="Close Chat").click()');
  await delay(300);assert.equal(panel.getVisible(),false);report.checks.push('Close hides native view');
  await window.webContents.executeJavaScript('document.querySelector(".chatgpt-panel-launcher").click()');await delay(300);
  assert.equal(window.contentView.children.filter(view=>view.webContents&&view.webContents!==window.webContents).length,1);
  assert.equal(panel.getVisible(),true);report.checks.push('Reopen reuses session and view');
  }
  await panel.webContents.executeJavaScript('[...document.querySelectorAll("button,a")].find(element=>element.textContent.trim()==="Log in")?.click()');
  await delay(6000);
  const loginUrl=new URL(panel.webContents.getURL());
  report.login={origin:loginUrl.origin,path:loginUrl.pathname,loading:panel.webContents.isLoading(),page:await panel.webContents.executeJavaScript('({title:document.title,hasEmailField:!!document.querySelector("input[type=email],input[autocomplete=username]"),hasLoginText:/log in|sign in|welcome back/i.test(document.body?.innerText||"")})')};
  assert.equal(report.login.page.hasEmailField,true);report.checks.push('ChatGPT sign-in form opens without credentials');
  fs.writeFileSync(path.join(run,'sign-in.png'),(await panel.webContents.capturePage()).toPNG());
  if(process.env.VOYAGE_CHAT_PANEL_LOGIN_PROBE==='1'){
   let destination;
   panel.webContents.on('will-navigate',(_event,url)=>{destination=url;});
   panel.webContents.on('will-redirect',(_event,url)=>{destination=url;});
   panel.webContents.focus();
   await panel.webContents.executeJavaScript('document.querySelector("input[type=email]").focus()');
   await panel.webContents.insertText('voyage-chat-panel-probe@example.invalid');
   assert.equal(await panel.webContents.executeJavaScript('document.querySelector("input[type=email]").value==="voyage-chat-panel-probe@example.invalid"'),true);
   await delay(200);
   void panel.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(element=>element.textContent.trim()==="Continue")?.click()').catch(()=>{});
   await delay(12000);
   const after=new URL(panel.webContents.getURL());
   report.loginProbe={origin:after.origin,diagnostics:await bounded(window.webContents.executeJavaScript('window.voyage.invoke("chatPanelDiagnostics")'))};
   fs.writeFileSync(path.join(run,'report.json'),JSON.stringify(report,null,2));
   report.loginProbe.page=await bounded(panel.webContents.executeJavaScript('({hasPasswordField:!!document.querySelector("input[type=password]"),hasEmailField:!!document.querySelector("input[type=email]"),bodyLength:document.body?.innerText.length||0})'));
   const image=await bounded(panel.webContents.capturePage());if(image.toPNG)fs.writeFileSync(path.join(run,'login-probe.png'),image.toPNG());
   if(process.env.VOYAGE_CHAT_PANEL_WINDOW_COMPARE==='1'&&destination){
    const comparison=new BrowserWindow({width:900,height:760,webPreferences:{session:panel.webContents.session,sandbox:true,nodeIntegration:false,contextIsolation:true}});
    void comparison.loadURL(destination).catch(()=>{});
    await delay(12000);
    const comparisonUrl=new URL(comparison.webContents.getURL()||'about:blank');
    report.windowComparison={origin:comparisonUrl.origin,loading:comparison.webContents.isLoading(),page:await bounded(comparison.webContents.executeJavaScript('({hasPasswordField:!!document.querySelector("input[type=password]"),hasEmailField:!!document.querySelector("input[type=email]"),bodyLength:document.body?.innerText.length||0})'))};
    report.windowComparison.diagnostics=await bounded(window.webContents.executeJavaScript('window.voyage.invoke("chatPanelDiagnostics")'));
    comparison.destroy();
   }
  }
 }catch(error){report.error=error.stack;process.exitCode=1;}
 finally{fs.writeFileSync(path.join(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({run,...report},null,2));app.exit(process.exitCode||0);}
});
setTimeout(()=>{fs.writeFileSync(path.join(run,'report.json'),JSON.stringify({...report,error:'Timed out'},null,2));console.error('Chat panel smoke test timed out: '+run);app.exit(1);},95000).unref();
