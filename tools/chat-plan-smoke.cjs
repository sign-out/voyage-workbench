const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'voyage-chat-plan-smoke-'));
app.setPath('userData',directory);
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const timeout=setTimeout(()=>{console.error('Chat plan smoke timed out');app.exit(1);},60000);
let delayNextSave=false,releaseSave,heldProject,freezeWhileSaving=true,suppressProjectPoll=false;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(event,method,payload)=>{if(suppressProjectPoll&&method==='project'&&payload?.revision!==undefined)return {unchanged:true,revision:payload.revision};if(heldProject&&method==='project'&&payload?.id===heldProject.project.id)return heldProject;const delayed=delayNextSave&&method==='command'&&payload?.command?.type==='chatPlan';if(delayed){delayNextSave=false;if(freezeWhileSaving)heldProject=await listener(event,'project',{id:payload.id});}const result=await listener(event,method,payload);if(delayed)await new Promise(resolve=>{releaseSave=resolve;});return result;});
app.on('browser-window-created',(_,window)=>window.webContents.once('did-finish-load',async()=>{
 try{
  const evaluate=expression=>window.webContents.executeJavaScript(expression);
  async function wait(expression){for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await pause(100);}throw new Error('Not ready: '+expression);}
  async function button(text){const selector=`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)})`;await wait(`!!(${selector})&&!(${selector}).disabled`);await evaluate(`(${selector}).click()`);await pause(100);}
  async function input(label,value){await evaluate(`(()=>{const input=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(100);}
  async function tool(name){await evaluate(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent===${JSON.stringify(name)}).click()`);await pause(100);}
  async function pendingSave(){for(let attempt=0;attempt<100&&!releaseSave;attempt++)await pause(50);assert.ok(releaseSave,'Save response is delayed');}
  function completeSave(){const release=releaseSave;releaseSave=undefined;heldProject=undefined;release();}
  await wait('!!window.voyage&&!!document.querySelector(".chatgpt-panel-launcher")');
  const source='{"title":"Plan fixture","exact":9007199254740993}';
  const id=await evaluate(`(async()=>{const result=await window.voyage.invoke('create',{name:'Plan fixture',source:${JSON.stringify(source)}});await window.voyage.invoke('command',{id:result.project.id,command:{type:'workOrder',order:{objective:'Old order',requirements:['Old requirement'],allowedPaths:[],wholeWorld:true}}});localStorage.setItem('voyage-project',result.project.id);return result.project.id;})()`);
  window.webContents.reload();await wait(`document.querySelector('.workspace-world-title')?.textContent==='Plan fixture'`);await evaluate('window.confirm=()=>true; true');
  await button('ChatGPT Chat · Preview');
  for(let attempt=0;attempt<100&&!window.contentView.children.some(child=>child.webContents&&child.webContents!==window.webContents);attempt++)await pause(50);
  await button('Save response as plan');await wait('!!document.querySelector(".chat-plan-review")');
  const view=window.contentView.children.find(child=>child.webContents&&child.webContents!==window.webContents);
  assert.ok(view);assert.equal(view.getVisible(),false,'Native remote page is hidden during local review');
  await input('Plan title','Build better factions');await input('Plan text','Add two rivals.\nPreserve <script>literal text</script>.');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Build this plan…').disabled`),true);
  delayNextSave=true;await button('Save plan locally');await pendingSave();await button('Close Chat');await button('ChatGPT Chat · Preview');
  await input('Plan text','New edits after reopening.');assert.equal(await evaluate(`JSON.parse(localStorage.getItem('voyage-chat-plan-draft:'+${JSON.stringify(id)})).expectedRevision`),0);completeSave();
  await wait(`JSON.parse(localStorage.getItem('voyage-chat-plan-draft:'+${JSON.stringify(id)})).expectedRevision===1`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Plan text"]').value`),'New edits after reopening.');
  await button('Save plan locally');await wait(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 2')`);
  let stored=await evaluate(`window.voyage.invoke('project',{id:${JSON.stringify(id)}})`);
  assert.equal(stored.project.chatPlan.title,'Build better factions');assert.equal(stored.project.activeSource,source);assert.equal(stored.project.tasks.length,0);assert.equal(stored.project.chat.length,0);
  await input('Plan text','Add two rivals.\nKeep exact numbers.');await button('Close Chat');
  window.webContents.reload();await wait(`document.querySelector('.workspace-world-title')?.textContent==='Plan fixture'`);await evaluate('window.confirm=()=>true; true');
  await button('ChatGPT Chat · Preview');await button('Save response as plan');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Plan text"]').value`),'Add two rivals.\nKeep exact numbers.');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Build this plan…').disabled`),true);
  delayNextSave=true;await button('Save plan locally');await pendingSave();await button('Back to ChatGPT');await button('Save response as plan');completeSave();
  await wait(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 3')`);
  await evaluate(`window.voyage.invoke('command',{id:${JSON.stringify(id)},command:{type:'chatPlan',expectedRevision:3,plan:{title:'Another saved version',text:'Changed elsewhere'}}})`);
  await wait(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 4')`);
  await button('Keep my edits against saved revision');assert.equal(await evaluate(`document.querySelector('[aria-label="Plan text"]').value`),'Add two rivals.\nKeep exact numbers.');
  await button('Save plan locally');await wait(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 5')`);
  freezeWhileSaving=false;delayNextSave=true;await input('Plan text','Delayed direction.');await button('Save plan locally');await pendingSave();await button('Close Chat');await button('ChatGPT Chat · Preview');
  await wait(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 6')`);
  if(await evaluate(`[...document.querySelectorAll('button')].some(button=>button.textContent==='Keep my edits against saved revision')`))await button('Keep my edits against saved revision');await input('Plan text','Add two rivals.\nKeep exact numbers.');await button('Save plan locally');
  await wait(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 7')`);
  suppressProjectPoll=true;completeSave();await pause(300);
  assert.equal(await evaluate(`document.querySelector('.chat-plan-review').textContent.includes('Saved revision 7')`),true,'Late save receipt does not roll back the loaded project');
  await button('Reload saved plan');assert.equal(await evaluate(`document.querySelector('[aria-label="Plan text"]').value`),'Add two rivals.\nKeep exact numbers.');suppressProjectPoll=false;
  await button('Close Chat');await tool('Models & agents');await wait(`!!document.querySelector('[aria-label^="Connection name "]')`);
  const provider=await evaluate(`(()=>{const input=document.querySelector('[aria-label^="Connection name "]');return {label:input.getAttribute('aria-label'),value:input.value};})()`);
  await input(provider.label,provider.value+' unsaved');await button('ChatGPT Chat · Preview');
  await evaluate(`window.confirm=message=>!message.startsWith('Discard unsaved form changes'); true`);await button('Build this plan…');
  assert.equal(await evaluate('!!document.querySelector(".chat-plan-review")'),true,'Canceled navigation keeps review open');
  assert.equal(await evaluate(`document.querySelector('.workspace-heading h1').textContent`),'Models & agents');
  assert.equal(await evaluate(`document.querySelector('[aria-label="${provider.label}"]').value`),provider.value+' unsaved');
  await button('Close Chat');await evaluate('window.confirm=()=>true; true');await tool('Planning');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Work Order objective"]').value`),'Old order','Canceled handoff leaves the existing Work Order untouched');
  await button('ChatGPT Chat · Preview');
  await button('Build this plan…');await wait('!document.querySelector(".chatgpt-panel")&&!!document.querySelector(".work-order")');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Work Order objective"]').value`),'Build better factions');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Work Order requirements"]').value`),'Add two rivals.\nKeep exact numbers.');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Allow whole authored world"]').checked`),false);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Allowed paths"]').value`),'[]');
  stored=await evaluate(`window.voyage.invoke('project',{id:${JSON.stringify(id)}})`);assert.equal(stored.project.workOrder.objective,'Old order');assert.equal(stored.project.tasks.length,0);
  await button('Save Work Order');await wait(`document.body.textContent.includes('Select existing scope paths')`);
  stored=await evaluate(`window.voyage.invoke('project',{id:${JSON.stringify(id)}})`);assert.equal(stored.project.activeSource,source);assert.equal(stored.project.tasks.length,0);
  console.log('PASS: local import/edit/save; close/back during delayed save preserves acknowledgments and newer edits; reload persistence; canceled navigation preserves form and review; handoff resets scope; no model tasks or world edits');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{clearTimeout(timeout);for(const open of BrowserWindow.getAllWindows())open.destroy();app.exit(process.exitCode||0);}
}));
require(path.resolve('build/desktop/main.cjs'));
