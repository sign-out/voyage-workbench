const {app,ipcMain}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'voyage-recovery-settings-'));
app.setPath('userData',directory);
const timeout=setTimeout(()=>{console.error('Recovery settings smoke timed out');app.exit(1);},60000);
let rejectSave=false,rejectRead=false,saveCount=0;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,async(event,method,payload)=>{
 if(method==='assistantRecoverySettings'&&rejectRead){rejectRead=false;throw new Error('Synthetic preference load failed');}
 if(method==='saveAssistantRecoverySettings'){
  saveCount++;
  if(rejectSave){rejectSave=false;throw new Error('Synthetic preference save failed');}
 }
 return listener(event,method,payload);
});
app.on('browser-window-created',(_,window)=>window.webContents.once('did-finish-load',async()=>{
 try{
  const evaluate=expression=>window.webContents.executeJavaScript(expression);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,50));
  async function wait(expression){for(let attempt=0;attempt<200;attempt++){if(await evaluate(expression))return;await pause();}throw new Error('Not ready: '+expression);}
  async function openSettings(){await wait(`!!document.querySelector('.tools-menu-items')`);await evaluate(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span')?.textContent==='Settings').click()`);await wait(`!!document.querySelector('[aria-label="Automatically resolve assistant errors"]')&&!document.querySelector('[aria-label="Automatically resolve assistant errors"]').disabled`);}
  async function number(value){await evaluate(`(()=>{const input=document.querySelector('[aria-label="Maximum recovery attempts"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause();await evaluate(`document.querySelector('[aria-label="Maximum recovery attempts"]').blur()`);}
  await openSettings();
  assert.equal(await evaluate(`document.querySelector('[aria-label="Automatically resolve assistant errors"]').checked`),true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Maximum recovery attempts"]').value`),'3');
  await number('5');await wait(`!document.querySelector('[aria-label="Maximum recovery attempts"]').disabled`);
  assert.deepEqual(await evaluate(`window.voyage.invoke('assistantRecoverySettings')`),{enabled:true,maxAttempts:5});
  const beforeInvalid=saveCount;await number('11');await wait(`document.querySelector('[role="alert"]')?.textContent.includes('whole number')`);assert.equal(saveCount,beforeInvalid);
  await number('5');
  await evaluate(`document.querySelector('[aria-label="Automatically resolve assistant errors"]').click()`);
  await wait(`!document.querySelector('[aria-label="Automatically resolve assistant errors"]').disabled`);
  assert.deepEqual(await evaluate(`window.voyage.invoke('assistantRecoverySettings')`),{enabled:false,maxAttempts:5});
  assert.equal(await evaluate(`document.querySelector('[aria-label="Maximum recovery attempts"]').disabled`),true);
  await evaluate(`document.querySelector('[aria-label="Automatically resolve assistant errors"]').click()`);
  await wait(`!document.querySelector('[aria-label="Maximum recovery attempts"]').disabled`);
  rejectSave=true;await number('6');await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Synthetic preference save failed')`);
  assert.deepEqual(await evaluate(`window.voyage.invoke('assistantRecoverySettings')`),{enabled:true,maxAttempts:5});
  assert.equal(await evaluate(`document.querySelector('[aria-label="Maximum recovery attempts"]').value`),'5');
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Reload recovery preferences').click()`);
  await wait(`!document.querySelector('[aria-label="Maximum recovery attempts"]').disabled&&!document.querySelector('[role="alert"]')`);
  rejectRead=true;window.webContents.reload();await wait(`!!document.querySelector('.tools-menu-items')`);await evaluate(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span')?.textContent==='Settings').click()`);
  await wait(`document.querySelector('[role="alert"]')?.textContent.includes('Synthetic preference load failed')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Automatically resolve assistant errors"]').disabled`),true);
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Reload recovery preferences').click()`);
  await wait(`!document.querySelector('[aria-label="Maximum recovery attempts"]').disabled`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Maximum recovery attempts"]').value`),'5');
  console.log(JSON.stringify({ok:true,defaultEnabled:true,defaultAttempts:3,persists:true,invalidInputBlocked:true,failedSavePreservesPreference:true,failedReadBlocksEditing:true}));
  clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
}));
require('../build/desktop/main.cjs');
