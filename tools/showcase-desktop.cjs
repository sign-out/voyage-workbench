const {app}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'voyage-showcase-'));
const output=path.resolve('docs/showcase');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',directory);
const tools=['World','Map','Characters','Mod overlays','Changes','Validation','Planning','Proposals','Artwork','Asset library','Music','Mechanics & AI','Publish','Base template','History','Models & agents','Voyage sync','Connection','World tools','Settings'];
const timeout=setTimeout(()=>{console.error('Showcase timed out');app.exit(1);},180000);
app.on('browser-window-created',(_,window)=>window.webContents.once('did-finish-load',async()=>{
 try {
  const evaluate=expression=>window.webContents.executeJavaScript(expression);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,650));
  async function wait(expression){for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await pause();}throw Error('Not ready: '+expression);}
  async function capture(identifier){await pause();fs.writeFileSync(path.join(output,'desktop-'+identifier+'.png'),(await window.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'desktop-'+identifier+'.json'),JSON.stringify(await evaluate('document.body.innerText'),null,2));}
  async function tool(name){await evaluate(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent===${JSON.stringify(name)}).click()`);await pause();}
  async function button(text){await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('No button '+${JSON.stringify(text)});button.scrollIntoView({block:'center'});button.click();})()`);await pause();}
  const fixture=fs.readFileSync('fixtures/lantern-coast.json','utf8');
  await evaluate(`(async()=>{const created=await window.voyage.invoke('create',{name:'Lantern Coast',source:${JSON.stringify(fixture)}});localStorage.setItem('voyage-project',created.project.id);})()`);
  window.webContents.reload();
  await wait(`!!document.querySelector('.workspace-world-title')`);
  window.setMinimumSize(320,480);window.setContentSize(1440,960);
  await wait('innerWidth===1440');
  for(const [index,name] of tools.entries()){
   await evaluate(`[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent===${JSON.stringify(name)}).click()`);
   await capture(String(index+1).padStart(2,'0'));
   if(name==='World'){
    await capture('world-form');
    await evaluate(`document.querySelector('button[aria-label="Switch to JSON view"]').click()`);
    await capture('world-json');
    await evaluate(`document.querySelector('button[aria-label="Switch to Form view"]').click()`);
   }
   if(name==='World tools'){
    for(const [extra,label] of [['impact','Reference impact'],['inventory','Asset inventory'],['batch','Batch edit']]){
     await evaluate(`[...document.querySelectorAll('.authoring-switcher button')].find(button=>button.textContent===${JSON.stringify(label)}).click()`);
     await capture(extra);
    }
   }
   console.log('Captured desktop',name);
  }
  const id=await evaluate(`localStorage.getItem('voyage-project')`);
  const baseHash=crypto.createHash('sha256').update(fixture).digest('hex');
  const candidate=fixture.replace('Practical, exhausted, and unwilling to abandon her crew.','Practical, exhausted, and unwilling to abandon her crew. She keeps a ledger of ships that never returned.');
  await evaluate(`(async()=>{await window.voyage.invoke('command',{id:${JSON.stringify(id)},command:{type:'builderNote',baseHash:${JSON.stringify(baseHash)},note:{id:'showcase-note',path:[],text:'Give Mara a personal stake in the missing offshore watch. Preserve her grounded voice and current location.',planning:true}}});await window.voyage.invoke('command',{id:${JSON.stringify(id)},command:{type:'workOrder',order:{objective:'Deepen Mara’s background without changing her role.',requirements:['Add one concrete personal stake.','Preserve current location and all unrelated world fields.'],allowedPaths:[['npcs','Mara Venn']]}}});await window.voyage.invoke('checkpoint',{id:${JSON.stringify(id)},label:'Before character background pass'});await window.voyage.invoke('command',{id:${JSON.stringify(id)},command:{type:'stage',id:'showcase-proposal',kind:'work',title:'Manual demo: Mara’s missing-ship ledger',source:${JSON.stringify(candidate)}}});})()`);
  window.webContents.reload();await wait(`!!document.querySelector('.workspace-world-title')`);
  await tool('World');await evaluate(`document.querySelector('.builder-notes').open=true;document.querySelector('.builder-notes').scrollIntoView({block:'center'})`);await capture('notes');
  await tool('Planning');await evaluate(`document.querySelector('.work-order')?.scrollIntoView({block:'center'})`);await capture('work-order');
  await tool('Proposals');await capture('proposal');
  await tool('History');await capture('checkpoint');
  await tool('Characters');await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Mara Venn')).click()`);await capture('character');
  await tool('Mechanics & AI');await button('Combat SettingscombatSettings');await capture('combat');
  await tool('Music');await button('CharacterCreationFantasyCharacter creation');await capture('track');
  await tool('Artwork');await button('Map artwork');await capture('map-art');
  await tool('Publish');await button('Open full-screen preview');await capture('preview');await evaluate(`document.querySelector('[aria-label="Close publication preview"]').click()`);
  const mapped=JSON.parse(fixture);mapped.realms={'The Remembering Sea':{name:'The Remembering Sea',basicInfo:'A coast charted by ancient lamps.'}};Object.assign(mapped.regions['Lantern Coast'],{realm:'The Remembering Sea',x:0,y:0});Object.assign(mapped.locations.Brinehaven,{x:25,y:35});
  await evaluate(`(async()=>{const created=await window.voyage.invoke('create',{name:'Lantern Coast — map demo',source:${JSON.stringify(JSON.stringify(mapped,null,2))}});localStorage.setItem('voyage-project',created.project.id);})()`);window.webContents.reload();await wait(`!!document.querySelector('.workspace-world-title')`);await tool('Map');await capture('realm');
  clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
}));
require('../build/desktop/main.cjs');
