const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
app.whenReady().then(async()=>{
 const window=new BrowserWindow({width:1440,height:1000,show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
 const errors=[];
 window.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 try {
  await window.loadFile(path.resolve('docs/voyage-workbench-showcase.html'));
  const evaluate=expression=>window.webContents.executeJavaScript(expression);
  assert.equal(await evaluate('features.length'),20);
  let views=0;
  for(const width of [1440,1024,768,390,320]){
   window.setContentSize(width,1000);
   await new Promise(resolve=>setTimeout(resolve,100));
   for(const platform of ['mobile','desktop']){
    await evaluate(`document.querySelector('.platforms button[data-platform="${platform}"]').click()`);
    for(let index=0;index<20;index++){
     await evaluate(`selectTool(features[${index}])`);
     await evaluate(`document.getElementById('main-screen').decode()`);
     const layout=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.getElementById('tool-name').textContent,image:document.getElementById('main-screen').naturalWidth})`);
     assert.ok(layout.scroll<=layout.width,`Overflow ${platform}/${index+1} at ${width}: ${layout.scroll}`);
     assert.ok(layout.image>0,`Screenshot missing ${platform}/${index+1}`);
     for(const identifier of await evaluate(`[[selected.id,'Overview'],...selected.extras].map(extra=>extra[0]).filter(identifier=>screens[platform+'-'+identifier])`)){
      await evaluate(`showScreenshot(${JSON.stringify(identifier)});document.getElementById('main-screen').decode()`);
      views++;
     }
    }
   }
   console.log('Checked width',width);
  }
  await evaluate(`document.getElementById('tool-search').value='JSON';document.getElementById('tool-search').dispatchEvent(new Event('input'))`);
  assert.ok(await evaluate(`document.querySelectorAll('#tool-nav button').length>=3`));
  await evaluate(`document.getElementById('tool-search').value='no-such-tool-987';document.getElementById('tool-search').dispatchEvent(new Event('input'))`);
  assert.equal(await evaluate(`document.getElementById('empty').hidden`),false);
  await evaluate(`document.getElementById('tool-search').value='';document.getElementById('tool-search').dispatchEvent(new Event('input'));selectTool(features[0]);document.getElementById('open-screen').click()`);
  assert.equal(await evaluate(`document.getElementById('image-viewer').open`),true);
  await evaluate(`document.getElementById('viewer-scale').click()`);
  assert.equal(await evaluate(`document.getElementById('image-viewer').dataset.zoom`),'actual');
  await evaluate(`document.getElementById('viewer-scale').click()`);
  assert.equal(await evaluate(`document.getElementById('image-viewer').dataset.zoom`),'fit');
  await evaluate(`document.getElementById('image-viewer').close()`);
  assert.equal(await evaluate(`document.getElementById('image-viewer').open`),false);
  assert.equal(await evaluate(`document.querySelectorAll('script[src],link[rel=stylesheet],img[src^="http"]').length`),0);
  assert.equal(errors.length,0,errors.join('\n'));
  window.setContentSize(1440,1000);
  await evaluate(`document.querySelector('.platforms button[data-platform="desktop"]').click();selectTool(features[7]);showScreenshot('proposal');window.scrollTo(0,0)`);
  await new Promise(resolve=>setTimeout(resolve,250));
  fs.writeFileSync('docs/showcase/guide-desktop.png',(await window.webContents.capturePage()).toPNG());
  window.setContentSize(390,1000);
  await evaluate(`document.querySelector('.platforms button[data-platform="mobile"]').click();selectTool(features[0]);window.scrollTo(0,0)`);
  await new Promise(resolve=>setTimeout(resolve,250));
  fs.writeFileSync('docs/showcase/guide-mobile.png',(await window.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({ok:true,toolsPerPlatform:20,viewportWidths:[1440,1024,768,390,320],screenshotViewsChecked:views,search:true,lightbox:true,offline:true,errors}));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
