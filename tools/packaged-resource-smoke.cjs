const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const artifactRoot=path.resolve(process.env.VOYAGE_ARTIFACT_ROOT||'releases');
const timeout=setTimeout(()=>{console.error('Packaged resource smoke timed out');app.exit(1);},30000);
app.whenReady().then(async()=>{
 for(const platform of ['linux','win']){
  const resources=path.join(artifactRoot,platform+'-unpacked','resources');
  const archive=path.join(resources,'app.asar');
  const references=JSON.parse(fs.readFileSync(path.join(archive,'dist/references/sections.json'),'utf8'));
  assert.ok(references.length>0);
  for(const name of ['blank-world','lantern-coast','living-continuity'])assert.ok(Object.keys(JSON.parse(fs.readFileSync(path.join(archive,'dist/references',name+'.json'),'utf8'))).length);
  for(const name of ['references','third-party'])assert.ok(!fs.existsSync(path.join(resources,name)));
  const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await window.loadFile(path.join(archive,'dist/third-party/index.html'));
  const text=await window.webContents.executeJavaScript('document.body.textContent');
  assert.ok(text.includes('Electronic delivery is free of charge'));
  const notices=JSON.parse(fs.readFileSync(path.join(archive,'dist/third-party/SOURCES.json'),'utf8'));
  assert.equal(notices.workbenchVersion,JSON.parse(fs.readFileSync('package.json','utf8')).version);
  window.destroy();
  console.log(platform+': single-copy ASAR references and offline notice viewer verified');
 }
 clearTimeout(timeout);
 app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
app.on('window-all-closed',()=>{});
