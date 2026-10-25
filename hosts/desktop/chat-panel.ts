import {BrowserWindow,WebContentsView,session} from 'electron';
import {chatPanelHome,chatPanelNavigationAllowed,chatPanelBounds,chatPanelOrigin} from './chat-panel-policy';
import {chatPanelPageUiScript} from './chat-panel-page-ui';
import {installEditContextMenu} from './edit-context-menu';

export function createChatPanel(window:BrowserWindow){
 let view:WebContentsView|undefined,phase='Not opened',failure='',visible=false,stalled=false,popupGeneration=0,loadingTimer:ReturnType<typeof setTimeout>|undefined;
 const popups=new Set<BrowserWindow>();
 const diagnostics:{time:string;event:string;origin?:string;code?:number|string}[]=[];
 function dismissPopups(){popupGeneration++;for(const popup of popups)popup.destroy();}
 function record(event:string,url?:string,code?:number|string){diagnostics.push({time:new Date().toISOString(),event,...url?{origin:chatPanelOrigin(url)}:{},...code===undefined?{}:{code}});if(diagnostics.length>60)diagnostics.shift();}
 function status(){return {phase,failure,visible,stalled};}
 function ensure(){
  if(view)return view;
  const isolated=session.fromPartition('persist:voyage-chatgpt-panel');
  isolated.setPermissionRequestHandler((_contents,permission,callback)=>{record('permission-denied',undefined,permission);callback(false);});
  isolated.setPermissionCheckHandler(()=>false);
  isolated.on('will-download',event=>event.preventDefault());
  isolated.webRequest.onBeforeRequest((details,callback)=>{if(details.resourceType==='mainFrame')record('document-request',details.url);callback({});});
  isolated.webRequest.onResponseStarted(details=>{if(details.resourceType==='mainFrame')record('document-response',details.url,details.statusCode);});
  isolated.webRequest.onCompleted((details)=>{if(details.statusCode>=400)record('http-error',details.url,details.statusCode);});
  isolated.webRequest.onErrorOccurred(details=>record('network-error',details.url,details.error));
  const preferences={session:isolated,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false};
  view=new WebContentsView({webPreferences:preferences});
  window.contentView.addChildView(view);
  function protect(contents:Electron.WebContents){
   installEditContextMenu(contents);
   contents.on('will-navigate',(event,url)=>{record('navigate',url);if(!chatPanelNavigationAllowed(url)){event.preventDefault();record('navigation-blocked',url);failure='Navigation to '+chatPanelOrigin(url)+' was blocked. Use Home to recover or copy diagnostics.';}});
   contents.on('will-redirect',(event,url)=>{record('redirect',url);if(!chatPanelNavigationAllowed(url)){event.preventDefault();record('redirect-blocked',url);failure='A redirect to '+chatPanelOrigin(url)+' was blocked. Use Home to recover or copy diagnostics.';}});
   contents.setWindowOpenHandler(({url,referrer,postBody})=>{
    record('popup-request',url);
    if(!visible||stalled||window.isDestroyed()){record('popup-blocked-hidden',url);return {action:'deny'};}
    if(!chatPanelNavigationAllowed(url)){record('popup-blocked',url);failure='A sign-in popup to '+chatPanelOrigin(url)+' was blocked. Copy diagnostics to investigate.';return {action:'deny'};}
    const generation=popupGeneration;
    return {action:'allow',overrideBrowserWindowOptions:{parent:window,width:600,height:760,show:false,autoHideMenuBar:true,webPreferences:preferences},createWindow:options=>{
     const popup=new BrowserWindow({...options,parent:window,show:false,webPreferences:{...options.webPreferences,...preferences}});
     const active=()=>visible&&!stalled&&generation===popupGeneration&&!window.isDestroyed()&&!contents.isDestroyed();
     popups.add(popup);protect(popup.webContents);popup.on('closed',()=>popups.delete(popup));
     const showPopup=()=>{if(popup.isDestroyed())return;if(active())popup.show();else popup.destroy();};
     popup.once('ready-to-show',showPopup);popup.webContents.once('did-finish-load',showPopup);
     setImmediate(()=>{if(!popup.isDestroyed()&&!active())popup.destroy();});
     const guestContents=(options as Electron.BrowserWindowConstructorOptions&{webContents?:Electron.WebContents}).webContents;
     if(!guestContents&&active())void popup.loadURL(url,{httpReferrer:referrer,...postBody?{postData:postBody.data,extraHeaders:'Content-Type: '+postBody.contentType+(postBody.boundary?'; boundary='+postBody.boundary:'')}: {}}).catch(()=>{});
     return popup.webContents;
    }};
   });
   contents.on('will-attach-webview',event=>event.preventDefault());
   contents.on('did-navigate',(_event,url,status)=>record('navigated',url,status));
   contents.on('did-fail-provisional-load',(_event,code,_description,url,main)=>{if(main&&code!==-3)record('provisional-load-failed',url,code);});
   contents.on('did-fail-load',(_event,code,_description,url,main)=>{if(main&&code!==-3){record('load-failed',url,code);phase='Could not load sign-in page';failure='Page load failed ('+code+') at '+chatPanelOrigin(url)+'. Use Home to recover or copy diagnostics.';}});
   contents.on('render-process-gone',(_event,details)=>{record('renderer-stopped',undefined,details.reason);phase='Chat page stopped';failure='Chat renderer stopped ('+details.reason+'). Use Home or Reload to recover.';});
  }
  protect(view.webContents);
  view.webContents.on('did-start-navigation',details=>{
   if(!details.isMainFrame||details.isSameDocument)return;
   clearTimeout(loadingTimer);phase='Loading ChatGPT…';failure='';stalled=false;view!.setVisible(visible);
   loadingTimer=setTimeout(()=>{stalled=true;dismissPopups();phase='Sign-in or page navigation stalled';failure='The page did not finish loading. Use Home to recover, or Open in browser to check sign-in there. The browser session is separate.';record('navigation-timeout',view!.webContents.getURL());view!.setVisible(false);},25000);
  });
  view.webContents.on('dom-ready',()=>{
   clearTimeout(loadingTimer);stalled=false;view!.setVisible(visible);phase=failure?'Chat needs attention':'Page ready — sign in or chat below';
   if(chatPanelOrigin(view!.webContents.getURL())==='https://chatgpt.com')void view!.webContents.executeJavaScriptInIsolatedWorld(999,[{code:chatPanelPageUiScript}]).catch(()=>record('context-menu-suppression-failed'));
  });
  view.webContents.on('did-stop-loading',()=>{clearTimeout(loadingTimer);stalled=false;view!.setVisible(visible);phase=failure?'Chat needs attention':'Page loaded — sign in or chat below';record('loading-stopped',view!.webContents.getURL());});
  void view.webContents.loadURL(chatPanelHome).catch(()=>{});
  return view;
 }
 window.on('closed',()=>{visible=false;clearTimeout(loadingTimer);dismissPopups();if(view&&!view.webContents.isDestroyed())view.webContents.close();});
 return {request(method:string,payload:any){
  if(method==='chatPanelStatus')return status();
  if(method==='chatPanelDiagnostics')return {version:1,...status(),events:diagnostics.slice()};
  if(method==='chatPanelHide'){visible=false;view?.setVisible(false);dismissPopups();return status();}
  if(method==='chatPanelShow'){
   const [width,height]=window.getContentSize(),bounds=chatPanelBounds(payload,width,height),panel=ensure();
   panel.setBounds(bounds);visible=true;panel.setVisible(bounds.width>0&&bounds.height>0&&!stalled);return status();
  }
  if(method==='chatPanelReload'){const panel=ensure();failure='';panel.webContents.reload();return status();}
  if(method==='chatPanelHome'){const panel=ensure();failure='';void panel.webContents.loadURL(chatPanelHome).catch(()=>{});return status();}
  throw new Error('Unsupported Chat panel operation.');
 }};
}
