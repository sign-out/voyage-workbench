const {app,BrowserWindow,dialog}=require('electron');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
assert.equal(JSON.parse(fs.readFileSync('package.json','utf8')).main,'build/desktop/main.cjs','Desktop package must declare its Electron entry point');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voyage-electron-'));app.setPath('userData',dir);
const timeout=setTimeout(()=>{console.error('Electron smoke timed out');app.exit(1)},120000);
async function ensureJsonView(window){
 for(let attempt=0;attempt<60;attempt++){
  const ready=await window.webContents.executeJavaScript(`(()=>{if(document.querySelector('textarea[aria-label="JSON source"]'))return true;const toggle=document.querySelector('button[aria-label="Switch to JSON view"]');if(toggle)toggle.click();return false;})()`);
  if(ready)return;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('JSON view did not become ready');
}
async function ensureFormView(window){
 await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Switch to Form view"]')?.click()`);
 for(let attempt=0;attempt<60;attempt++){
  if(await window.webContents.executeJavaScript(`!!document.querySelector('.structured-editor')`))return;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('Form view did not become ready');
}
async function verifyEditorViews(window){
 const source='{ "worldBackground":"Before", "exact":90071992547409931234, "unknown":{"scale":1.2300e+42}}';
 await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[aria-label="JSON source"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(source)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await ensureFormView(window);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Exact"]').value`),'90071992547409931234');
 await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[aria-label="World Background"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'After');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await ensureJsonView(window);
 const edited=await window.webContents.executeJavaScript(`document.querySelector('[aria-label="JSON source"]').value`);
 assert.equal(edited,source.replace('Before','After'));
 await ensureFormView(window);
 await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Expand World Background"]').click()`);
 assert.ok(await window.webContents.executeJavaScript(`document.querySelector('.text-edit-screen')?.open`));
 await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[aria-label="Expanded World Background"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Full-screen edit');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await window.webContents.executeJavaScript(`document.querySelector('.text-edit-screen').dispatchEvent(new Event('cancel',{cancelable:true}))`);
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(await window.webContents.executeJavaScript(`document.activeElement.getAttribute('aria-label')`),'Expand World Background');
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="World Background"]').value`),'Full-screen edit');
 await ensureJsonView(window);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.editor-caption button')].find(button=>button.textContent==='Format JSON').click()`);
 const formatted=await window.webContents.executeJavaScript(`document.querySelector('[aria-label="JSON source"]').value`);
 assert.ok(formatted.includes('\n'));assert.ok(formatted.includes('90071992547409931234'));assert.ok(formatted.includes('1.2300e+42'));assert.ok(await window.webContents.executeJavaScript(`!!document.querySelector('.json-token-key')&&!!document.querySelector('.json-line-numbers')`));
 const {clipboard,ClipboardItem}=require('electron'),previousClipboard=await Promise.all((await clipboard.read()).filter(item=>item.types.length>0).map(async item=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))));
 try{
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.editor-caption button')].find(button=>button.textContent==='Copy JSON').click()`);
  for(let attempt=0;attempt<40;attempt++){if(await clipboard.readText()===formatted)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(await clipboard.readText(),formatted);
 }finally{if(previousClipboard.length)await clipboard.write(previousClipboard);else clipboard.clear();}
 const originalSaveDialog=dialog.showSaveDialog,selectionFile=path.join(dir,'editor-selection.json');
 try{
  dialog.showSaveDialog=async()=>({canceled:false,filePath:selectionFile});
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.editor-caption button')].find(button=>button.textContent==='Export selection').click()`);
  for(let attempt=0;attempt<40&&!fs.existsSync(selectionFile);attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(fs.readFileSync(selectionFile,'utf8'),formatted);
 }finally{dialog.showSaveDialog=originalSaveDialog;}
 await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[aria-label="JSON source"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'{"unfinished":');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Switch to Form view"]').click();})()`);
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(await window.webContents.executeJavaScript(`document.querySelector('.editor-main').textContent.includes('your text is preserved')`));
 await ensureJsonView(window);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="JSON source"]').value`),'{"unfinished":');
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.editor-actions button')].find(button=>button.textContent==='Discard draft').click()`);
 await new Promise(resolve=>setTimeout(resolve,150));
}
async function resizeWindow(window,width,height){window.setContentSize(width,height);for(let attempt=0;attempt<40;attempt++){if(await window.webContents.executeJavaScript('innerWidth')===width){await new Promise(resolve=>setTimeout(resolve,100));return;}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Viewport did not resize to '+width);}
async function verifyAppearance(window){
 assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('header [aria-label="Color theme"]')`),false);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent==='Settings').click()`);
 for(let attempt=0;attempt<40;attempt++){if(await window.webContents.executeJavaScript(`!!document.querySelector('.workspace-settings [aria-label="Color theme"]')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
 await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Publish mobile shortcut"]').click()`);
 await new Promise(resolve=>setTimeout(resolve,100));
 const limit=await window.webContents.executeJavaScript(`({notice:document.querySelector('.settings-shortcut-status [role="status"]')?.textContent,checked:document.querySelector('[aria-label="Publish mobile shortcut"]').checked,count:document.querySelector('#shortcut-limit-mobile').textContent})`);
 assert.ok(limit.notice.includes('4/4'));assert.ok(limit.count.includes('4 / 4 selected'));assert.equal(limit.checked,false);
 for(const label of ['Proposals mobile shortcut','Publish mobile shortcut','Artwork desktop shortcut','History desktop shortcut','Move World down']){
  await window.webContents.executeJavaScript(`document.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 const layout=await window.webContents.executeJavaScript(`({saved:JSON.parse(localStorage.getItem('voyage-navigation-v1')),menu:[...document.querySelectorAll('.tools-menu-items button')].map(button=>button.querySelector('span').textContent),desktop:[...document.querySelectorAll('.desktop-primary span')].map(element=>element.textContent),mobile:[...document.querySelectorAll('.mobile-primary span')].map(element=>element.textContent)})`);
 assert.equal(layout.saved.order[0],'map');assert.equal(layout.menu[0],'Map');
 assert.deepEqual(layout.mobile,['Map','World','Characters','Publish']);assert.ok(layout.desktop.includes('History'));assert.ok(!layout.desktop.includes('Artwork'));
 await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});
 for(let attempt=0;attempt<40;attempt++){if(await window.webContents.executeJavaScript(`!!document.querySelector('.desktop-primary')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.deepEqual(await window.webContents.executeJavaScript(`[...document.querySelectorAll('.mobile-primary span')].map(element=>element.textContent)`),layout.mobile,'Tool choices and ordering must survive restarting the UI');
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent==='Settings').click()`);
 for(let attempt=0;attempt<40;attempt++){if(await window.webContents.executeJavaScript(`!!document.querySelector('.workspace-settings')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.workspace-settings button')].find(button=>button.textContent==='Reset tool layout').click()`);
 await new Promise(resolve=>setTimeout(resolve,100));
 for(const theme of ['light','system','dark']){
  await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('[aria-label="Color theme"]');select.value=${JSON.stringify(theme)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  const appearance=await window.webContents.executeJavaScript(`({saved:localStorage.getItem('voyage-theme'),resolved:document.documentElement.dataset.theme,systemDark:matchMedia('(prefers-color-scheme: dark)').matches,background:getComputedStyle(document.querySelector('.workspace')).backgroundColor,ink:getComputedStyle(document.querySelector('.adaptive-app')).color})`);
  assert.equal(appearance.saved,theme);
  assert.equal(appearance.resolved,theme==='system'?(appearance.systemDark?'dark':'light'):theme);
  if(theme==='dark'){assert.equal(appearance.background,'rgb(23, 25, 28)');assert.equal(appearance.ink,'rgb(218, 221, 223)');}
 }
}
async function verifyVoyageSync(window){
 async function waitFor(expression){for(let attempt=0;attempt<60;attempt++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,150));}throw Error('Voyage sync UI did not become ready: '+expression);}
 const originalFetch=globalThis.fetch,calls=[];let source='{"shortId":"SMOKE_SYNC","title":"Remote import","initialGameState":{"n":9007199254740993}}',writes=0,readbackMismatch=false,rejectSave=false;
 globalThis.fetch=async(url,options={})=>{const target=new URL(String(url));if(!['api.aidungeon.com','api-alpha.aidungeon.com'].includes(target.hostname))return originalFetch(url,options);assert.equal(target.hostname,'api-alpha.aidungeon.com','Voyage UI must only contact Alpha');calls.push({method:options.method||'GET',path:target.pathname});assert.equal(options.headers.Authorization,'Bearer smoke-sync-key');if(target.pathname.endsWith('/validate'))return new Response('{"data":{"valid":true}}');if(options.method==='PUT'){writes++;assert.equal(options.body,'{"world":'+source+'}');assert.equal(options.headers['If-Match'],writes===1?'"sync-v1"':'"sync-v2"');if(rejectSave)return new Response('{"error":{"code":"revision_conflict","message":"Remote draft changed"}}',{status:412});return new Response('{}');}if(target.pathname.endsWith('/worlds'))return new Response('{"data":{"worlds":[{"shortId":"SMOKE_SYNC","title":"Remote import","visibility":"private"}]}}');return new Response('{"data":{"world":'+(readbackMismatch?source.replace('Remote import','Remote changed'):source)+'}}',{headers:{etag:writes?'"sync-v2"':'"sync-v1"'}});};
 try{
  const previous=await window.webContents.executeJavaScript(`(async()=>{const id=localStorage.getItem('voyage-project');await window.voyage.invoke('connectVoyage',{key:'smoke-sync-key'});return (await window.voyage.invoke('project',{id})).project;})()`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('header button')].find(button=>button.textContent==='Import from Voyage').click()`);
  await waitFor(`!!document.querySelector('select[aria-label="Voyage import destination"]')&&![...document.querySelectorAll('button')].find(button=>button.textContent==='Connect key').disabled`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="Voyage import destination"]').value`),'new');assert.equal(calls.length,0);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='List my worlds').click()`);
  await waitFor(`!!document.querySelector('.remote-list button')`);
  await window.webContents.executeJavaScript(`document.querySelector('.remote-list button').click()`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Import from Voyage API').click()`);
 await ensureJsonView(window);
  await waitFor(`document.querySelector('textarea[aria-label="JSON source"]')?.value.includes('9007199254740993')`);
  const imported=await window.webContents.executeJavaScript(`(async()=>{const id=localStorage.getItem('voyage-project');return (await window.voyage.invoke('project',{id})).project;})()`);assert.notEqual(imported.id,previous.id);assert.equal(imported.activeSource,source);
  const originalSaveDialog=dialog.showSaveDialog,exportFile=path.join(dir,'api-import-export.json');
  try{
   dialog.showSaveDialog=async()=>({canceled:false,filePath:exportFile});
   await window.webContents.executeJavaScript(`[...document.querySelectorAll('header button')].find(button=>button.textContent==='Export JSON').click()`);
   for(let attempt=0;attempt<60&&!fs.existsSync(exportFile);attempt++)await new Promise(resolve=>setTimeout(resolve,100));
   assert.equal(fs.readFileSync(exportFile,'utf8'),source,'Exporting an API import must preserve its complete JSON');
   dialog.showSaveDialog=async()=>({canceled:true});
   assert.equal((await window.webContents.executeJavaScript(`window.voyage.invoke('export',{source:${JSON.stringify(source)},name:'cancelled.json'})`)).saved,false);
   assert.equal(fs.readFileSync(exportFile,'utf8'),source);
  }finally{dialog.showSaveDialog=originalSaveDialog;}
  const retained=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:${JSON.stringify(previous.id)}})`);assert.equal(retained.project.activeSource,previous.activeSource);assert.equal(writes,0);
  const originalOpenDialog=dialog.showOpenDialog,rawImport=path.join(dir,'raw-state-import.json');fs.writeFileSync(rawImport,'{"n":9007199254740995,"note":"selected edit"}');
  try{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[rawImport]});
   await window.webContents.executeJavaScript(`[...document.querySelectorAll('header button')].find(button=>button.textContent==='Import JSON').click()`);
   await waitFor(`document.querySelector('.import-note')?.textContent.includes('metadata')&&document.querySelectorAll('.change-choice button').length===2`);
   assert.equal(await window.webContents.executeJavaScript(`(async()=>{const id=localStorage.getItem('voyage-project');return (await window.voyage.invoke('project',{id})).project.activeSource;})()`),source);
   await window.webContents.executeJavaScript(`[...document.querySelectorAll('.change')].find(article=>article.querySelector('.before').textContent==='9007199254740993').querySelector('button').click()`);
   await waitFor(`!!document.querySelector('.change-choice button[aria-pressed="true"]')`);
   await window.webContents.executeJavaScript(`document.querySelector('.change-choice button[aria-pressed="true"]').click()`);
   await waitFor(`!document.querySelector('.change-choice button[aria-pressed="true"]')`);
   await window.webContents.executeJavaScript(`[...document.querySelectorAll('.change')].find(article=>article.querySelector('.before').textContent==='9007199254740993').querySelector('button').click()`);
   await waitFor(`!!document.querySelector('.change-choice button[aria-pressed="true"]')`);
   await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Accept selected changes').click()`);
   await waitFor(`document.querySelector('.review-page')?.textContent.includes('No proposals to review')`);
   source=await window.webContents.executeJavaScript(`(async()=>{const id=localStorage.getItem('voyage-project');return (await window.voyage.invoke('project',{id})).project.activeSource;})()`);
   assert.ok(source.includes('9007199254740993'));assert.ok(!source.includes('9007199254740995'));assert.equal(JSON.parse(source).initialGameState.note,'selected edit');assert.equal(JSON.parse(source).title,'Remote import');assert.equal(JSON.parse(source).shortId,'SMOKE_SYNC');assert.equal(writes,0);
  }finally{dialog.showOpenDialog=originalOpenDialog;}

  await window.webContents.executeJavaScript(`[...document.querySelectorAll('header button')].find(button=>button.textContent==='Save to Voyage').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(button=>button.textContent==='Save to Voyage API'&&!button.disabled)`);
  await window.webContents.executeJavaScript(`window.confirm=()=>true;[...document.querySelectorAll('button')].find(button=>button.textContent==='Save to Voyage API').click()`);
  await waitFor(`document.querySelector('.feature-status')?.textContent.includes('Saved to Voyage')`);
  const saved=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:${JSON.stringify(imported.id)}})`);assert.equal(saved.project.activeSource,source);assert.equal(saved.project.remote.operations[0].state,'CONFIRMED');assert.equal(writes,1);
  readbackMismatch=true;
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Save to Voyage API').click()`);
  await waitFor(`document.querySelector('.remote-save-status.warning')?.textContent.includes('Voyage save not confirmed')`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.remote-save-status').textContent.includes('Saved to Voyage')`),false);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.remote-save-status').textContent.includes('Read-back differences')`),true);
  readbackMismatch=false;
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Reconcile save').click()`);
  await waitFor(`document.querySelector('.remote-save-status.success')?.textContent.includes('Saved to Voyage')`);assert.equal(writes,2);
  rejectSave=true;
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Save to Voyage API').click()`);
  await waitFor(`document.querySelector('.remote-save-status.error')?.textContent.includes('revision_conflict')`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.remote-save-status').textContent.includes('Saved to Voyage')`),false);
  rejectSave=false;
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Save to Voyage API').click()`);
  await waitFor(`document.querySelector('.remote-save-status.success')?.textContent.includes('Saved to Voyage')`);assert.equal(writes,4);
  await window.webContents.executeJavaScript(`(async()=>{const id=${JSON.stringify(imported.id)},project=(await window.voyage.invoke('project',{id})).project,previous=project.remote.operations[0];await window.voyage.invoke('command',{id,command:{type:'savePrepare',id:'auto-sync-check',baseHash:previous.sourceHash,payload:previous.payload}});await window.voyage.invoke('command',{id,command:{type:'saveState',id:'auto-sync-check',state:'SEND_ATTEMPTED'}});await window.voyage.invoke('command',{id,command:{type:'saveState',id:'auto-sync-check',state:'UNKNOWN',detail:'Remote content differs; do not retry automatically'}});})()`);
  await waitFor(`!!document.querySelector('.remote-save-status.warning')`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Save to Voyage API').click()`);
  await waitFor(`document.querySelector('.remote-save-status.success')?.textContent.includes('Saved to Voyage')`);assert.equal(writes,4);

 }finally{globalThis.fetch=originalFetch;}
}
async function verifyAuthoringTools(window){
 async function waitFor(expression){for(let attempt=0;attempt<80;attempt++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Authoring UI did not become ready: '+expression);}
 async function tool(name){await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent===${JSON.stringify(name)}).click()`);await waitFor(`document.querySelector('header h1').textContent===${JSON.stringify(name)}`);}
 async function button(name){await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(name)}).click()`);}
 async function input(selector,value){await window.webContents.executeJavaScript(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(resolve=>setTimeout(resolve,50));}
 const fixture='{"shortId":"SMOKE_SYNC","initialGameState":{"worldBackground":"Audit fixture","npcs":{"mara":{"id":"mara","name":"Mara","basicInfo":"Archivist","currentLocation":"home","exact":9007199254740993},"orin":{"name":"Orin","basicInfo":"Cartographer","currentLocation":"home"}},"locations":{"home":{"name":"Home","region":"north","imageUrl":"https://example.invalid/map.png"}},"regions":{"north":{"realm":"earth"}},"realms":{"earth":{}},"custom":{"scale":1.2300e+42}}}';
 await window.webContents.executeJavaScript(`(async()=>{const id=localStorage.getItem('voyage-project');await window.voyage.invoke('command',{id,command:{type:'stage',id:'authoring-smoke',source:${JSON.stringify(fixture)},kind:'import',title:'Authoring audit fixture'}});await window.voyage.invoke('command',{id,command:{type:'accept',id:'authoring-smoke'}});})()`);
 await tool('World tools');await input('[aria-label="Search authoring entries"]','Mara');await waitFor(`[...document.querySelectorAll('.authoring-list button')].some(button=>button.textContent==='Mara')`);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-list button')].find(button=>button.textContent==='Mara').click()`);await waitFor(`document.querySelector('header h1').textContent==='World'&&document.querySelector('.breadcrumbs').textContent.includes('mara')`);
 await resizeWindow(window,320,915);await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Open editor')?.click()`);await waitFor(`document.querySelector('.entry-tool-actions button')?.getBoundingClientRect().width>0`);
 const overlap=await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.entry-tool-actions button');button.scrollIntoView({block:'center'});const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return {hit:hit===button||button.contains(hit),page:document.documentElement.scrollWidth,viewport:innerWidth};})()`);assert.ok(overlap.hit,'Mobile entry tools are covered by form fields');assert.ok(overlap.page<=overlap.viewport);
 await button('Inspect references, assets & entry tools');await waitFor(`document.querySelector('header h1').textContent==='World tools'`);await input('[aria-label="Bookmark name"]','Mara audit');await button('Bookmark current entry');await waitFor(`document.querySelector('.authoring-workbench').textContent.includes('Bookmark saved')`);
 await button('Reference impact');await waitFor(`document.querySelector('.authoring-workbench').textContent.includes('Open target')`);assert.ok(await window.webContents.executeJavaScript(`document.querySelector('.authoring-workbench').textContent.includes('currentLocation')`));
 await button('Asset inventory');await waitFor(`document.querySelector('.authoring-workbench').textContent.includes('https://example.invalid/map.png')`);assert.ok(await window.webContents.executeJavaScript(`document.querySelector('.authoring-workbench').textContent.includes('size unknown')`));
 await button('Completeness');await waitFor(`document.querySelector('.authoring-workbench').textContent.includes('Cached')||document.querySelector('.authoring-workbench').textContent.includes('Local checks')`);
 await button('Duplicate entry');await input('[aria-label="Duplicate content ID"]','mara-copy');await input('.authoring-workbench input:not([type="checkbox"]):not([aria-label])','Mara copy');await button('Preview duplicate in Proposals');await waitFor(`document.querySelector('header h1').textContent==='Proposals'&&document.querySelector('.entity-review-group')`);
 assert.equal(await window.webContents.executeJavaScript(`(async()=>{const project=(await window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})).project;return project.activeSource.includes('"mara-copy"');})()`),false);await button('Accept proposal');await waitFor(`document.querySelector('.review-page').textContent.includes('No proposals')`);
 await tool('World tools');await button('Batch edit');await waitFor(`document.querySelectorAll('.authoring-list input[type="checkbox"]').length===3`);await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-list input[type="checkbox"]')].slice(0,2).forEach(input=>input.click())`);await input('[aria-label="Batch replacement JSON"]','"Updated"');await button('Preview batch in Proposals');await waitFor(`document.querySelector('header h1').textContent==='Proposals'&&document.querySelectorAll('.entity-review-group').length===2`);await button('Accept proposal');await waitFor(`document.querySelector('.review-page').textContent.includes('No proposals')`);
 const preserved=await window.webContents.executeJavaScript(`(async()=>{const project=(await window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})).project;return {source:project.activeSource,bookmarks:project.bookmarks};})()`);assert.ok(preserved.source.includes('9007199254740993'));assert.ok(preserved.source.includes('1.2300e+42'));assert.equal(preserved.bookmarks[0].name,'Mara audit');
 await tool('History');await input('[aria-label="Manual checkpoint label"]','Audited checkpoint');await button('Save labeled checkpoint');await waitFor(`document.querySelector('.checkpoint-tools').textContent.includes('Audited checkpoint')`);
 await window.webContents.executeJavaScript(`(()=>{const before=document.querySelector('[aria-label="Checkpoint before"]'),after=document.querySelector('[aria-label="Checkpoint after"]');before.value=[...before.options].at(-1).value;before.dispatchEvent(new Event('change',{bubbles:true}));after.value='active';after.dispatchEvent(new Event('change',{bubbles:true}));})()`);await button('Compare selected revisions');await waitFor(`document.querySelector('.note-change-screen')?.open&&document.querySelector('.note-change-screen').textContent.includes('changes')`);assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.note-change-screen').getBoundingClientRect().width`),320);await button('Done');
 await tool('Planning');await input('[aria-label="Work Order objective"]','Improve the copied character');await input('.scope-picker [aria-label="Find scope entries"]','mara-copy');await waitFor(`document.querySelectorAll('.scope-picker .authoring-list input').length>0`);await window.webContents.executeJavaScript(`document.querySelector('.scope-picker .authoring-list input').click()`);await button('Save Work Order');await waitFor(`!document.querySelector('[role="alert"]')`);
 const order=await window.webContents.executeJavaScript(`(async()=>{return (await window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})).project.workOrder;})()`);assert.equal(order.reviewedScope,true);assert.equal(order.wholeWorld,false);assert.ok(order.allowedPaths[0].includes('mara-copy'));
 await tool('Publish');await waitFor(`document.querySelectorAll('.readiness-checklist li').length===8`);assert.ok(await window.webContents.executeJavaScript(`!document.querySelector('.readiness-checklist [role="alert"]')`));
 for(const width of [320,412,1280]){await resizeWindow(window,width,915);await tool('World tools');for(const name of ['Find & bookmark','Completeness','Reference impact','Asset inventory','Duplicate entry','Batch edit']){await button(name);await new Promise(resolve=>setTimeout(resolve,150));const layout=await window.webContents.executeJavaScript(`({width:document.documentElement.scrollWidth,viewport:innerWidth,error:document.querySelector('.authoring-workbench [role="alert"]')?.textContent||''})`);assert.ok(layout.width<=layout.viewport,'Authoring tool overflows: '+name+' '+width);assert.equal(layout.error,'');}}
}
async function verifyArtworkDefaults(window){
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Artwork').click()`);
 await new Promise(resolve=>setTimeout(resolve,150));await window.webContents.executeJavaScript(`[...document.querySelectorAll('.artwork-purpose button')].find(button=>button.textContent==='Map artwork').click()`);
 await new Promise(resolve=>setTimeout(resolve,150));
 const before=await window.webContents.executeJavaScript(`({detail:document.querySelector('[aria-label="Artwork detail"]').value,columns:document.querySelector('[aria-label="Artwork columns"]').value,rows:document.querySelector('[aria-label="Artwork rows"]').value})`);assert.deepEqual(before,{detail:'medium',columns:'2',rows:'2'});
 await window.webContents.executeJavaScript(`(()=>{const detail=document.querySelector('[aria-label="Artwork detail"]');detail.value='high';detail.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Artwork columns"]').value`),'2');assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Artwork rows"]').value`),'2');
}
async function verifyWorkspaceLayouts(window){
 window.setMinimumSize(320,480);
 const names=await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].map(button=>button.querySelector('span').textContent)`);
 const layouts=[];
 for(const width of [320,412,1280]){
  await resizeWindow(window,width,915);
  for(const name of names){
   await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent===${JSON.stringify(name)}).click()`);
   await new Promise(resolve=>setTimeout(resolve,200));
   const layout=await window.webContents.executeJavaScript(`({title:document.querySelector('header h1').textContent,width:document.documentElement.scrollWidth,viewport:innerWidth,error:document.querySelector('[role="alert"]')?.textContent||'',controls:[...document.querySelector('.header-actions').children].filter(element=>getComputedStyle(element).display!=='none').map(element=>{const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right};})})`);
   assert.equal(layout.viewport,width);assert.equal(layout.title,name);assert.ok(layout.width<=layout.viewport,`${name} overflows at ${width}px: ${JSON.stringify(layout)}`);assert.equal(layout.error,'',`${name} reported an unexpected error: ${layout.error}`);layouts.push({name,width});
   const worldTitle=await window.webContents.executeJavaScript(`(()=>{const element=document.querySelector('.workspace-world-title'),rect=element.getBoundingClientRect();return {text:element.textContent,title:element.title,width:rect.width,right:rect.right};})()`);
   assert.equal(worldTitle.text,'Remote import');assert.equal(worldTitle.title,'Remote import');assert.ok(worldTitle.width>0&&worldTitle.right<=width,`World title is hidden at ${width}px`);
   const longTitle=await window.webContents.executeJavaScript(`(()=>{const element=document.querySelector('.workspace-world-title'),original=element.textContent;element.textContent='A very long readable world title '.repeat(20);const rect=element.getBoundingClientRect(),result={width:rect.width,right:rect.right,pageWidth:document.documentElement.scrollWidth,truncated:element.scrollWidth>element.clientWidth};element.textContent=original;return result;})()`);
   assert.ok(longTitle.width>0&&longTitle.right<=width&&longTitle.pageWidth<=width&&longTitle.truncated,`Long world title overflows at ${width}px: ${JSON.stringify(longTitle)}`);
   if(width===412)assert.ok(layout.controls.every(rect=>rect.left>=0&&rect.right<=width),`${name} clips a header control: ${JSON.stringify(layout.controls)}`);
  }
 }
 window.setMinimumSize(320,480);await resizeWindow(window,412,915);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='World').click()`);
 await new Promise(resolve=>setTimeout(resolve,200));
 await window.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('.children button')].find(button=>button.textContent.includes('note'));if(!button)throw Error('Authored note field missing');button.click();})()`);
 await ensureFormView(window);
 for(let attempt=0;attempt<40;attempt++){if(await window.webContents.executeJavaScript(`!!document.querySelector('textarea[aria-label="Text value"]')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
 const editor=await window.webContents.executeJavaScript(`({navigator:getComputedStyle(document.querySelector('.navigator')).display,form:!!document.querySelector('textarea[aria-label="Text value"]'),text:document.querySelector('textarea[aria-label="Text value"]')?.value})`);assert.equal(editor.navigator,'none');assert.ok(editor.form);assert.equal(editor.text,'selected edit');
 await window.webContents.executeJavaScript(`document.querySelector('.mobile-editor-nav button').click()`);
 await new Promise(resolve=>setTimeout(resolve,200));assert.notEqual(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.navigator')).display`),'none');
 await window.webContents.executeJavaScript(`document.querySelector('.tools-menu summary').click()`);
 const menuBounds=await window.webContents.executeJavaScript(`(()=>{const rect=document.querySelector('[aria-label="All workspace tools"]').getBoundingClientRect();return {left:rect.left,right:rect.right};})()`);assert.ok(menuBounds.left>=0&&menuBounds.right<=412);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[aria-label="All workspace tools"]').querySelectorAll('button').length`),names.length);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('[aria-label="All workspace tools"] button')].find(button=>button.textContent==='Voyage sync').click()`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('header h1').textContent`),'Voyage sync');
 for(const width of [320,412,1280]){
  await resizeWindow(window,width,915);
  await window.webContents.executeJavaScript(`document.querySelector('.mobile-menu').open=true`);
  await new Promise(resolve=>setTimeout(resolve,100));
  const files=await window.webContents.executeJavaScript(`(()=>{const rect=document.querySelector('.mobile-menu-items').getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};})()`);
  assert.ok(files.left>=0&&files.right<=width&&files.top>=0&&files.bottom<=915,'Files menu clipped at '+width+': '+JSON.stringify(files));
  await window.webContents.executeJavaScript(`document.querySelector('.tools-menu').open=true`);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('details[data-workspace-menu][open]').length`),1);
  const tools=await window.webContents.executeJavaScript(`(()=>{const rect=document.querySelector('.tools-menu-items').getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};})()`);
  assert.ok(tools.left>=0&&tools.right<=width&&tools.top>=0&&tools.bottom<=915,'Tools menu clipped at '+width+': '+JSON.stringify(tools));
  await window.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('details[data-workspace-menu][open]').length`),0);
  await window.webContents.executeJavaScript(`document.querySelector('.mobile-menu').open=true`);
  await new Promise(resolve=>setTimeout(resolve,100));
  await window.webContents.executeJavaScript(`document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('details[data-workspace-menu][open]').length`),0);
 }
 await resizeWindow(window,1280,900);return layouts.length;
}
async function verifyExactModels(window,profileId){
 const server=require('node:http').createServer((request,response)=>{assert.equal(request.method,'GET');assert.equal(request.url,'/models');response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data:[{id:'sol-fixture',displayName:'Sol fixture'},{id:'luna-fixture',displayName:'Luna fixture'}]}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const evaluate=expression=>window.webContents.executeJavaScript(expression);
 const field=async(label,value,tag='input')=>{await evaluate(`(()=>{const field=document.querySelector(${JSON.stringify('[aria-label="'+label+'"]')});Object.getOwnPropertyDescriptor(${tag==='select'?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(${JSON.stringify(tag==='select'?'change':'input')},{bubbles:true}));})()`);await new Promise(resolve=>setTimeout(resolve,50));};
 try{
  await field('API endpoint '+profileId,'http://127.0.0.1:'+server.address().port);
  await field('Default model '+profileId,'saved-custom');
  await field('planning provider',profileId,'select');
  await field('planning model','saved-stage-override');
  await evaluate(`document.getElementById(${JSON.stringify('provider-'+profileId)}).querySelector('.button-row button').click()`);
  for(let attempt=0;attempt<100;attempt++){if(await evaluate(`document.querySelector('.provider-page [role="status"]')?.textContent.includes('2 models loaded')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
  const state=await evaluate(`(()=>{const defaultInput=document.querySelector(${JSON.stringify('[aria-label="Default model '+profileId+'"]')}),picker=document.querySelector(${JSON.stringify('[aria-label="Default model '+profileId+' selection"]')});return {default:defaultInput.value,stage:document.querySelector('[aria-label="planning model"]').value,options:[...picker.options].map(option=>({id:option.value,label:option.textContent})),selected:picker.value};})()`);
  assert.equal(state.default,'saved-custom');assert.equal(state.stage,'saved-stage-override');assert.equal(state.selected,'__custom__');assert.ok(state.options.some(option=>option.id==='sol-fixture'&&option.label.includes('Sol fixture')));assert.ok(state.options.some(option=>option.id==='luna-fixture'));
  await field('Default model '+profileId+' selection','luna-fixture','select');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify('[aria-label="Default model '+profileId+'"]')}).value`),'luna-fixture');
  await evaluate(`[...document.querySelectorAll('.provider-page button')].find(button=>button.textContent==='Save settings').click()`);
  for(let attempt=0;attempt<100;attempt++){if(await evaluate(`document.querySelector('.provider-page [role="status"]')?.textContent.includes('API keys and stage routes saved')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
  const saved=await evaluate(`window.voyage.invoke('providerSettings')`);assert.equal(saved.settings.profiles.find(profile=>profile.id===profileId).model,'luna-fixture');assert.equal(saved.settings.routes.planning.model,'saved-stage-override');
 }finally{await new Promise(resolve=>server.close(resolve));}
}
async function verifyProviderSaving(window){
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Models & agents').click()`);
 for(let attempt=0;attempt<40;attempt++){if(await window.webContents.executeJavaScript(`!!document.querySelector('.connection-entry')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
 let noticesReady=false;
 for(let attempt=0;attempt<40;attempt++){noticesReady=await window.webContents.executeJavaScript(`document.querySelector('iframe[title="Third-party licenses and dependency source offer"]')?.contentDocument?.body?.textContent.includes('Electronic delivery is free of charge')`);if(noticesReady)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(noticesReady,'Bundled source offer must be readable from Models & agents');
 for(const width of [320,412,1280]){await resizeWindow(window,width,915);const bounds=await window.webContents.executeJavaScript(`(()=>{const page=document.querySelector('.provider-page');return {width:page.clientWidth,scroll:page.scrollWidth};})()`);assert.ok(bounds.scroll<=bounds.width,'Provider fields overflow internally at '+width+': '+JSON.stringify(bounds));}
 await resizeWindow(window,1280,900);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Add connection').click()`);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.provider-presets button')].find(button=>button.querySelector('strong')?.textContent==='OpenAI API').click()`);
 const profileId=await window.webContents.executeJavaScript(`(()=>{const field=[...document.querySelectorAll('input[type="password"]')].at(-1);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'smoke-provider-key');field.dispatchEvent(new Event('input',{bubbles:true}));return field.getAttribute('aria-label').slice('API key '.length);})()`);
 await new Promise(resolve=>setTimeout(resolve,100));
 await window.webContents.executeJavaScript(`window.confirm=()=>false;[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='World').click()`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('header h1').textContent`),'Models & agents');
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Save settings').click()`);
 for(let attempt=0;attempt<60;attempt++){if(await window.webContents.executeJavaScript(`document.querySelector('.provider-page [role="status"]')?.textContent.includes('API keys and stage routes saved')`))break;await new Promise(resolve=>setTimeout(resolve,100));}
 const saved=await window.webContents.executeJavaScript(`window.voyage.invoke('providerSettings',{})`);assert.ok(saved.settings.profiles.some(profile=>profile.id===profileId));assert.ok(saved.keys.includes(profileId));
 await verifyExactModels(window,profileId);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Voyage sync').click()`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('header h1').textContent`),'Voyage sync');
}
async function verifyPublicationPreview(window){
 async function waitFor(expression){for(let attempt=0;attempt<60;attempt++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Publication preview did not become ready: '+expression);}
 const server=require('node:http').createServer((request,response)=>{response.writeHead(200,{'Content-Type':'image/svg+xml'});response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><path fill="#259b80" d="M0 0h400v400H0z"/><path fill="#193d60" d="M400 0h400v400H400z"/><path fill="#bd7c32" d="M800 0h400v400H800z"/></svg>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const original=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})`);
 const copy={title:'A very long example world title that should be truncated in public previews without losing the saved title',description:'Public short copy\nSecond line',advancedDescription:'Public long copy\n\nA second paragraph. <script>not executable</script>',image:`http://127.0.0.1:${server.address().port}/cover.svg`,unknown:9007199254740993};
 const source=JSON.stringify(copy).slice(0,-1)+',"shortId":"SMOKE_SYNC","initialGameState":{"n":9007199254740993,"note":"selected edit"}}',baseHash=require('node:crypto').createHash('sha256').update(original.project.activeSource).digest('hex');
 try{
  await window.webContents.executeJavaScript(`(async()=>{const id=${JSON.stringify(original.project.id)};await window.voyage.invoke('command',{id,command:{type:'stage',id:'preview-fixture',kind:'import',source:${JSON.stringify(source)},baseHash:${JSON.stringify(baseHash)}}});await window.voyage.invoke('command',{id,command:{type:'accept',id:'preview-fixture'}});})()`);
  await waitFor(`document.querySelector('.workspace-world-title')?.textContent===${JSON.stringify(copy.title)}`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Publish').click()`);
  await waitFor(`!!document.querySelector('.publication-preview')`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-publication-copy=short]').textContent`),copy.description);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-publication-copy=long]').textContent`),copy.advancedDescription);
  assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.publication-site-previews')`),false,'Public layouts must not render inside the editing page');
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.publication-preview button')].find(button=>button.textContent==='Open full-screen preview').click()`);
  await waitFor(`!!document.querySelector('.publication-preview-screen[open]')`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-card-cover strong')`),null);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-card-title').textContent`),copy.title);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-hero-title').textContent`),copy.title);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-detail-short').textContent`),copy.description);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-detail-long').textContent`),copy.advancedDescription);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-listing-copy p').textContent`),copy.description);
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.publication-listing-copy p')).webkitLineClamp`),'3');
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-profile-copy p').textContent`),copy.description);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-profile-copy strong').title`),copy.title);
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.publication-hero-title')).webkitLineClamp`),'3');
  assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.publication-preview-screen script')`),false);
  await waitFor(`document.querySelector('.publication-card-cover img')?.naturalWidth>0`);
  for(const width of [320,412,1280]){
   await resizeWindow(window,width,915);
   for(const view of ['desktop','mobile']){
    await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('[aria-label="Publication preview viewport"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(view)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`document.querySelector('.publication-site-previews').classList.contains(${JSON.stringify(view)})`);
    const layout=await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.publication-card-cover').getBoundingClientRect(),detail=document.querySelector('.publication-detail-cover').getBoundingClientRect();return {pageWidth:document.documentElement.scrollWidth,cardRatio:card.width/card.height,detailRatio:detail.width/detail.height,fit:getComputedStyle(document.querySelector('.publication-detail-cover img')).objectFit};})()`);
    assert.ok(layout.pageWidth<=width);assert.ok(Math.abs(layout.cardRatio-1.6)<.02);assert.ok(Math.abs(layout.detailRatio-(view==='mobile'?1:1038/416))<.02);assert.equal(layout.fit,'cover');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.publication-world-page').getBoundingClientRect().width`),view==='mobile'?396:1038,'Preview size must not depend on the editor or screen width');
    const sourceAndProfile=await window.webContents.executeJavaScript(`(()=>{const original=document.querySelector('.publication-original-cover img'),profile=document.querySelector('.publication-profile-cover').getBoundingClientRect(),title=document.querySelector('.publication-profile-copy strong'),rect=original.getBoundingClientRect();return {originalRatio:rect.width/rect.height,originalFit:getComputedStyle(original).objectFit,profileRatio:profile.width/profile.height,titleTruncated:title.scrollWidth>title.clientWidth};})()`);
    assert.ok(Math.abs(sourceAndProfile.originalRatio-3)<.02);assert.equal(sourceAndProfile.originalFit,'contain');assert.ok(Math.abs(sourceAndProfile.profileRatio-1.4)<.02);assert.ok(sourceAndProfile.titleTruncated);
   }
  }
  await window.webContents.executeJavaScript(`document.querySelector('.publication-detail-cover img').dispatchEvent(new Event('error'))`);
  await waitFor(`document.querySelector('.publication-detail-cover').textContent.includes('Cover could not load')`);
  const unchanged=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:${JSON.stringify(original.project.id)}})`);assert.equal(unchanged.project.activeSource,source);
  await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Close publication preview"]').click()`);
  await waitFor(`!document.querySelector('.publication-preview-screen')`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.publication-preview button')].find(button=>button.textContent==='Open full-screen preview').click()`);
  await waitFor(`!!document.querySelector('.publication-preview-screen[open]')`);
  await resizeWindow(window,320,915);
  await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('[aria-label="Publication preview zoom"]');select.value='fit';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.querySelector('.preview-screen-content').getBoundingClientRect().width<=320`);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.preview-screen-content').offsetWidth`),396);
  assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.publication-hero-title')).fontSize`),'36px');
  await window.webContents.executeJavaScript(`document.querySelector('.publication-preview-screen').dispatchEvent(new Event('cancel',{cancelable:true}))`);
  await waitFor(`!document.querySelector('.publication-preview-screen')`);
  assert.equal(await window.webContents.executeJavaScript(`document.activeElement.textContent`),'Open full-screen preview');
  await window.webContents.executeJavaScript(`document.querySelector('.publication-original [aria-label^="Inspect"]').click()`);
  await waitFor(`!!document.querySelector('.image-inspection-screen img')?.naturalWidth`);
  await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('[aria-label="Image inspection zoom"]');select.value='actual';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.querySelector('.image-inspection-stage').classList.contains('actual')`);
  const imageSize=await window.webContents.executeJavaScript(`(()=>{const image=document.querySelector('.image-inspection-screen img'),rect=image.getBoundingClientRect();return {width:rect.width,height:rect.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};})()`);
  assert.equal(imageSize.width,imageSize.naturalWidth);assert.equal(imageSize.height,imageSize.naturalHeight);
  await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Close image inspection"]').click()`);
  await waitFor(`!document.querySelector('.image-inspection-screen')`);
  await resizeWindow(window,1280,915);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.publication-preview button')].find(button=>button.textContent==='Edit long copy').click()`);
 await ensureFormView(window);
  await waitFor(`document.querySelector('header h1').textContent==='World'&&document.querySelector('textarea[aria-label="Text value"]')?.value.includes('Public long copy')`);
 }finally{server.close();}
}
async function verifyCoverStudio(window){
 async function waitFor(expression){for(let attempt=0;attempt<80;attempt++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Cover studio did not become ready: '+expression);}
 const originalFetch=globalThis.fetch;let generations=0,grades=0,failGrade=false;
 const dataUrl=await window.webContents.executeJavaScript(`(()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=400;const context=canvas.getContext('2d');context.fillStyle='#163c58';context.fillRect(0,0,1200,400);context.fillStyle='#e8b450';context.fillRect(400,50,400,300);return canvas.toDataURL('image/png');})()`);
 const scores=Object.fromEntries('ABCDEFGHIJ'.split('').map(category=>[category,{score:9,reason:'Visible test composition'}]));
 const report={views:['discovery','phone','desktop','listing','profile'].map(id=>({id,scores:id==='phone'?{...scores,A:{score:4,reason:'Face lost at thumbnail size'}}:scores,criticalContentClipped:id==='listing',fix:'Keep the focal subject central'})),summary:'Revise before release',tradeoffs:'Scenery versus subject size',recommendations:['Improve thumbnail readability before polish']};
 globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('https://cover-test.example/'))return originalFetch(url,options);assert.equal(options.headers.Authorization,'Bearer cover-test-key');const body=JSON.parse(options.body);if(String(url).endsWith('/images/generations')){generations++;assert.match(body.prompt,/Default prompt kernel/);assert.match(body.prompt,/portrait listing/);return new Response(JSON.stringify({data:[{b64_json:dataUrl.split(',')[1]}]}));}grades++;assert.equal(body.model,grades===1?'building-vision-override':'manual-vision-override');assert.equal(body.messages[0].content.filter(part=>part.type==='image_url').length,9);assert.match(options.body,/Tradeoff matrix/);if(failGrade)return new Response('{}',{status:503});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(report)}}]}));};
 try{
  const before=await window.webContents.executeJavaScript(`(async()=>{const status=await window.voyage.invoke('providerSettings');status.settings.profiles.push({id:'cover-test',name:'Cover test provider',protocol:'openai',baseUrl:'https://cover-test.example/v1',model:'vision-text',imageModel:'image-test'});status.settings.routes.artwork={profileId:'cover-test',model:'image-test'};status.settings.routes.building={profileId:'cover-test',model:'building-vision-override'};await window.voyage.invoke('saveProviderSettings',{settings:status.settings});await window.voyage.invoke('providerKey',{profileId:'cover-test',key:'cover-test-key'});window.confirm=()=>true;return (await window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})).project.activeSource;})()`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Artwork').click()`);
  await waitFor(`!!document.querySelector('select[aria-label="Cover grader profile"] option[value="cover-test"]')`);
  await window.webContents.executeJavaScript(`(()=>{if(document.querySelector('[aria-label="Cover grader profile"]').value!=='cover-test'||document.querySelector('[aria-label="Cover grader model"]').value!=='building-vision-override')throw Error('Grader must default to the effective Building route');const direction=[...document.querySelectorAll('.cover-studio label')].find(label=>label.textContent.startsWith('Cover art direction')).querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(direction,'One iconic landmark and a dominant traveler');direction.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Generate cover & grade').click()`);
  await waitFor(`document.querySelector('.cover-grade-report')?.textContent.includes('69/100')`);assert.equal(generations,1);assert.equal(grades,1);
  assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.cover-evidence-grid img').length`),9);
  for(const width of [320,412,1280]){await resizeWindow(window,width,915);assert.ok(await window.webContents.executeJavaScript(`document.documentElement.scrollWidth<=innerWidth`));}
  await window.webContents.executeJavaScript(`(()=>{const model=document.querySelector('[aria-label="Cover grader model"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(model,'manual-vision-override');model.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(resolve=>setTimeout(resolve,100));
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Grade saved cover only').click()`);await waitFor(`!!document.querySelector('.cover-grade-report')&&![...document.querySelectorAll('button')].find(button=>button.textContent==='Grade saved cover only').disabled`);assert.equal(generations,1);assert.equal(grades,2);
  failGrade=true;await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Grade saved cover only').click()`);await waitFor(`document.querySelector('.cover-studio [role="alert"]')?.textContent.includes('503')`);assert.equal(generations,1);assert.equal(grades,3);assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.cover-original-image')&&!document.querySelector('.cover-grade-report')`),true);
  const after=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})`);assert.equal(after.project.activeSource,before);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.artwork-purpose button')].find(button=>button.textContent==='Map artwork').click()`);await waitFor(`document.querySelector('.feature-page h2')?.textContent==='Map artwork studio'`);
 }finally{globalThis.fetch=originalFetch;}
}
async function verifySharedViews(window){
 await verifyAppearance(window);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent==='World').click()`);
 async function waitFor(expression){for(let attempt=0;attempt<60;attempt++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,150));}throw Error('UI did not become ready: '+expression);}
 await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Open projects"]').click()`);
 await waitFor(`[...document.querySelectorAll('button')].some(button=>button.textContent==='Open Lantern Coast →')`);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Open Lantern Coast →').click()`);
 await ensureJsonView(window);
 await waitFor(`document.querySelector('textarea[aria-label="JSON source"]')?.value.includes('Mara')`);
 assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.workspace-world-title').textContent`),'Lantern Coast');
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Characters').click()`);
 await waitFor(`!!document.querySelector('.ce-card strong')`);
 const character=await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.ce-card');return {display:getComputedStyle(card).display,nameWidth:card.querySelector('strong').clientWidth,cardWidth:card.clientWidth,portraitHeight:card.querySelector('.ce-portrait').clientHeight,placeholder:!!card.querySelector('.ce-portrait-placeholder')};})()`);
 assert.equal(character.display,'block');assert.ok(character.nameWidth>character.cardWidth*.6);assert.equal(character.portraitHeight,36);assert.ok(character.placeholder);
 window.setMinimumSize(320,480);
 await resizeWindow(window,412,915);
 await window.webContents.executeJavaScript(`document.querySelector('.ce-card').click()`);
 await waitFor(`!!document.querySelector('.ce-panel.is-editing .ce-form textarea:not([disabled])')`);
 const mobileCharacter=await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('.ce-form textarea:not([disabled])');return {cards:getComputedStyle(document.querySelector('.ce-cards')).display,editor:getComputedStyle(document.querySelector('.ce-editor')).display,field:field.getAttribute('aria-label'),initial:field.value};})()`);assert.equal(mobileCharacter.cards,'none');assert.notEqual(mobileCharacter.editor,'none');
 await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('.ce-form textarea:not([disabled])');field.value+=${JSON.stringify(' UX smoke local edit')};field.dispatchEvent(new Event('input',{bubbles:true}));window.confirm=()=>false;document.querySelector('.ce-back').click();})()`);
 await new Promise(resolve=>setTimeout(resolve,200));assert.ok(await window.webContents.executeJavaScript(`!!document.querySelector('.ce-panel.is-editing')`));
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Map').click()`);
 assert.ok(await window.webContents.executeJavaScript(`!!document.querySelector('.ce-panel.is-editing')`));
 await window.webContents.executeJavaScript(`document.querySelector('.ce-form').requestSubmit()`);
 await waitFor(`document.querySelector('.ce-status')?.textContent.includes('saved locally')`);
 const savedCharacter=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})`);assert.ok(savedCharacter.project.activeSource.includes('UX smoke local edit'));
 await window.webContents.executeJavaScript(`document.querySelector('.ce-back').click()`);
 await waitFor(`!document.querySelector('.ce-panel.is-editing')`);
 assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.ce-editor')).display`),'none');
 await resizeWindow(window,1280,900);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.textContent==='Map').click()`);
 await waitFor(`!!document.querySelector('input[aria-label="New realm name"]')`);
 await window.webContents.executeJavaScript(`(()=>{document.querySelector('input[aria-label="New realm name"]').value='Smoke realm';[...document.querySelectorAll('button')].find(button=>button.textContent==='+ Realm').click();})()`);
 await waitFor(`!!document.querySelector('.map-inspector input[placeholder="Region name"]')`);
 await window.webContents.executeJavaScript(`(()=>{document.querySelector('.map-inspector input[placeholder="Region name"]').value='Smoke region';[...document.querySelectorAll('button')].find(button=>button.textContent==='Add region').click();})()`);
 await waitFor(`!!document.querySelector('.map-region-tile')`);
 const region=await window.webContents.executeJavaScript(`(()=>{const tile=document.querySelector('.map-region-tile');tile.textContent='A long region title that must remain clipped within its own map cell '.repeat(5);return {background:getComputedStyle(tile).backgroundColor,overflow:getComputedStyle(tile).overflow,cellOverflow:getComputedStyle(tile.parentElement).overflow,clientHeight:tile.clientHeight,scrollHeight:tile.scrollHeight,draggable:tile.draggable};})()`);
 assert.equal(region.background,'rgba(0, 0, 0, 0)');assert.equal(region.overflow,'hidden');assert.equal(region.cellOverflow,'hidden');assert.ok(region.scrollHeight>region.clientHeight);assert.ok(region.draggable);
 const hitArea=await window.webContents.executeJavaScript(`(()=>{const tile=document.querySelector('.map-region-tile'),cell=tile.parentElement;return {width:tile.offsetWidth,height:tile.offsetHeight,cellWidth:cell.clientWidth,cellHeight:cell.clientHeight};})()`);assert.equal(hitArea.width,hitArea.cellWidth);assert.equal(hitArea.height,hitArea.cellHeight);
 const beforeNavigation=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})`);
 await window.webContents.executeJavaScript(`document.querySelector('.map-region-tile').click()`);
 await waitFor(`document.querySelector('.map-local')?.getAttribute('aria-label')==='Location map for Smoke region'`);
 await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button=>button.textContent==='← Realm grid').click()`);
 await waitFor(`!!document.querySelector('.map-region-tile')`);
 const afterNavigation=await window.webContents.executeJavaScript(`window.voyage.invoke('project',{id:localStorage.getItem('voyage-project')})`);assert.equal(afterNavigation.project.activeSource,beforeNavigation.project.activeSource);
}
app.on('browser-window-created',(_,window)=>{window.webContents.once('did-finish-load',async()=>{try{const result=await window.webContents.executeJavaScript(`(async()=>{if(!window.voyage)throw Error('Preload bridge unavailable');const created=await window.voyage.invoke('create',{name:'Electron smoke',source:'{"title":"Desktop native","exact":9007199254740993}'});const stored=await window.voyage.invoke('project',{id:created.project.id});return {source:stored.project.activeSource,theme:document.documentElement.dataset.theme,title:document.title,bridge:!!window.voyage};})()`);assert.equal(result.source,'{"title":"Desktop native","exact":9007199254740993}');assert.equal(result.theme,'dark');await window.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='New world');if(!b)throw Error('New-world action missing');b.click();})()`);await ensureJsonView(window);let editorReady=false;for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,150));editorReady=await window.webContents.executeJavaScript(`!!document.querySelector('textarea[aria-label="JSON source"]')?.value.length`);if(editorReady)break;}assert.ok(editorReady,'Native file loading and document worker did not populate the editor');result.editorReady=editorReady;await verifyEditorViews(window);result.formJsonDraftVerified=true;await verifySharedViews(window);result.characterLayoutVerified=true;result.mapClippingVerified=true;await verifyVoyageSync(window);result.voyageImportSaveVerified=true;result.selectiveImportReviewVerified=true;result.characterEditingVerified=true;result.regionNavigationVerified=true;result.workspaceLayoutsVerified=await verifyWorkspaceLayouts(window);await verifyProviderSaving(window);result.providerSettingsAndKeysVerified=true;await verifyPublicationPreview(window);result.publicationPreviewVerified=true;await verifyCoverStudio(window);result.coverGenerationAndGradingVerified=true;await verifyAuthoringTools(window);result.authoringWorkflowsVerified=true;await verifyArtworkDefaults(window);result.artworkDefaultsVerified=true;fs.mkdirSync('docs/evidence/app',{recursive:true});await new Promise(r=>setTimeout(r,700));try{fs.writeFileSync('docs/evidence/app/electron-dark.png',(await window.webContents.capturePage()).toPNG());}catch(e){console.warn('Screenshot unavailable:',e.message);}fs.writeFileSync('docs/evidence/app/electron-smoke.json',JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,...result}));clearTimeout(timeout);app.exit(0);}catch(e){console.error(e);app.exit(1);}});});
require('../build/desktop/main.cjs');
