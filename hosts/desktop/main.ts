import {app,BrowserWindow,ipcMain,dialog,safeStorage,shell,clipboard} from 'electron';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {Service,type Secrets} from './service';import {exportSource,writeExport,writeMediaExport} from './export';
import {credentialStore} from './credential-file';
let service:Service;
app.whenReady().then(()=>{
  const bundled=path.join(process.resourcesPath,'provider',process.platform==='win32'?'bin/codex.exe':'codex');if(existsSync(bundled))process.env.VOYAGE_CODEX_BINARY=bundled;
  const directory=path.join(app.getPath('userData'),'workbench');
  const secretFile=path.join(app.getPath('userData'),'credentials.bin');
  const durable=safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text');
  const secrets:Secrets=credentialStore(secretFile,durable,text=>safeStorage.encryptString(text),encrypted=>safeStorage.decryptString(encrypted));
  service=new Service(directory,app.isPackaged?path.join(app.getAppPath(),'dist','references'):path.resolve(__dirname,'../../apps/workbench/public/references'),secrets);
  const window=new BrowserWindow({width:1450,height:940,minWidth:800,minHeight:600,backgroundColor:'#101719',title:'Voyage Workbench',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const entry=path.resolve(__dirname,'../../dist/index.html');
  ipcMain.handle('workbench',async(event,method,payload)=>{if(window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Invalid application frame.');
    if(method==='copyText'){if(typeof payload?.text!=='string')throw new Error('Clipboard text must be a string.');await clipboard.writeText(payload.text);return {copied:true};}
    if(method==='pickImport'){const r=await dialog.showOpenDialog(window,{filters:[{name:'Voyage world JSON',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;return {name:path.basename(r.filePaths[0]),source:readFileSync(r.filePaths[0],'utf8')};}
    if(method==='exportMedia'){const match=/^data:(image\/(png|jpeg|webp)|audio\/(mpeg|wav|ogg|mp4));base64,([A-Za-z0-9+/]*={0,2})$/.exec(payload.dataUrl);if(!match||match[3].length>45*1024*1024)throw new Error('Unsupported or oversized media.');const data=Buffer.from(match[3],'base64');if(!data.length||data.length>32*1024*1024)throw new Error('Media exceeds export size limit.');const result=await dialog.showSaveDialog(window,{defaultPath:path.basename(payload.name||'asset')});if(!result.canceled&&result.filePath)await writeMediaExport(result.filePath,data);return {saved:!result.canceled};}
    if(method==='exportImage'){const match=/^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(payload.dataUrl);if(!match)throw new Error('Unsupported image.');const r=await dialog.showSaveDialog(window,{defaultPath:payload.name});if(!r.canceled&&r.filePath)writeFileSync(r.filePath,Buffer.from(match[3],'base64'));return {saved:!r.canceled};}
    if(method==='export'){const source=exportSource(payload.source);const r=await dialog.showSaveDialog(window,{defaultPath:payload.name,filters:[{name:'JSON',extensions:['json']}]});if(!r.canceled&&r.filePath)await writeExport(r.filePath,source);return {saved:!r.canceled&&!!r.filePath};}
    if(method==='openExternal'){const url=new URL(payload.url);if(url.protocol!=='https:')throw new Error('Only secure external links are supported.');await shell.openExternal(url.href);return {};}
    return service.request(method,payload);
  });
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==window.webContents.getURL())event.preventDefault();});void window.loadFile(entry);
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{if(service){for(const run of service.agent.running.values())run.rpc.close();for(const run of service.providers.running.values())run.abort.abort();}});
