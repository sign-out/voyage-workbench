import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

test('rendered character artwork picker persists exact portrait associations, reports save failures and survives navigation',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-portrait-association-'));
 try{
  const bundle=await build({stdin:{contents:`
   import React,{useState} from 'react';
   import {createRoot} from 'react-dom/client';
   import {LegacyView} from './LegacyViews';
   import {AssetPicker} from './AssetLibrary';
   import {ArtworkWorkspace} from './ArtworkWorkspace';
   import {registerRemote} from './asset-library';
   import {create,reduce,hash} from '../../../packages/core/project';
   import * as features from '../../../packages/core/features';
   const source='{"world":{"title":"World","initialGameState":{"npcs":{"guide":{"name":"guide"},"other":{"name":"other"}},"premadeCharacters":[{"name":"Hero"}],"regions":{"coast":{"name":"Coast"}},"locations":{"port":{"name":"Port","areas":{"dock":{"name":"Dock"}}}},"itemTypes":{"key":{"name":"Key"}},"exact":90071992547409931234}}}';
   localStorage.setItem('portrait-project',JSON.stringify(create('portraits','World',source,1)));
   const store=new Map();window.calls=[];window.saves=0;
   window.voyage={invoke:async(method,payload)=>{
    window.calls.push(method);
    if(method==='references')return {sections:[]};
    if(method==='featureGet'){
     if(window.deferDetails&&payload.key==='creation-details:portraits')await new Promise(resolve=>window.finishDetails=resolve);
     return store.get(payload.key)||null;
    }
    if(method==='featureSet'){
     if('expected' in payload&&payload.expected!==(store.get(payload.key)||null))throw Error('This feature changed');
     store.set(payload.key,payload.value);return {};
    }
    throw Error('Unexpected provider, upload or world mutation: '+method);
   }};
   const root=createRoot(document.getElementById('root'));
   function Fixture(){
    const [project,setProject]=useState(()=>JSON.parse(localStorage.getItem('portrait-project'))),[picker,setPicker]=useState(null),[screen,setScreen]=useState('characters'),[epoch,setEpoch]=useState(0);
    window.project=project;
    const apply=async(text,base)=>{
     if(window.deferSave)await new Promise(resolve=>window.finishSave=resolve);
     if(window.rejectSave)throw Error('Fixture local save failed');
     const persisted=JSON.parse(localStorage.getItem('portrait-project'));
     const next=reduce(persisted,{type:'edit',path:[],source:text,baseHash:hash(base),now:Date.now()});
     localStorage.setItem('portrait-project',JSON.stringify(next));window.saves++;setProject(next);
    };
    window.reopen=()=>{setPicker(null);setProject(JSON.parse(localStorage.getItem('portrait-project')));setEpoch(value=>value+1);};
    window.showArtwork=()=>{setPicker(null);setScreen('artwork');};
    window.setEditorDraft=enabled=>{const persisted=JSON.parse(localStorage.getItem('portrait-project'));const command=enabled?{type:'draft',path:[],text:persisted.activeSource,baseHash:hash(persisted.activeSource)}:{type:'discardDraft'};const next=reduce(persisted,{...command,now:Date.now()});localStorage.setItem('portrait-project',JSON.stringify(next));setProject(next);};
    window.mutateWorld=()=>{const persisted=JSON.parse(localStorage.getItem('portrait-project'));const next=reduce(persisted,{type:'edit',path:[],source:persisted.activeSource.replace('{','{ '),baseHash:hash(persisted.activeSource),now:Date.now()});localStorage.setItem('portrait-project',JSON.stringify(next));setProject(next);};
    return <>{screen==='characters'?<LegacyView key={epoch} kind="characters" project={project} compute={async(method,...args)=>features[method](...args)} apply={apply} upload={(target,callback)=>setPicker({target,callback})}/>:<ArtworkWorkspace key={epoch} project={project} apply={apply} onCover={()=>{throw Error('Not a cover action');}}/>}{picker&&<AssetPicker kind="image" project={project} target={picker.target} onChoose={url=>picker.callback({imageUrl:url})} onClose={()=>setPicker(null)}/>}</>;
   }
   window.start=async()=>{await registerRemote('https://images.example/portrait.png','image','Library portrait',{target:'NPC_PORTRAIT'});root.render(<Fixture/>);};
  `,resolveDir:path.resolve('apps/workbench/src'),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'}});
  const styles=['apps/workbench/src/style.css','apps/workbench/src/adaptive.css','web/character-explorer.css'].map(file=>readFileSync(file,'utf8')).join('\n');
  writeFileSync(path.join(directory,'fixture.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div class="adaptive-app"><div id="root"></div></div><script>${bundle.outputFiles[0].text}</script>`);
  writeFileSync(path.join(directory,'run.cjs'),`
   const {app,BrowserWindow}=require('electron');
   app.setPath('userData',${JSON.stringify(path.join(directory,'user-data'))});
   app.whenReady().then(async()=>{
    const window=new BrowserWindow({show:false,width:420,height:850,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    try{await window.loadFile(${JSON.stringify(path.join(directory,'fixture.html'))});await window.webContents.executeJavaScript(${JSON.stringify(`(async()=>{
     const check=(condition,message)=>{if(!condition)throw Error(message);};
     const wait=async(condition)=>{for(let attempt=0;attempt<400;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Portrait attachment timed out: '+document.body.innerText);};
     const button=text=>{const element=[...document.querySelectorAll('button')].find(element=>element.textContent===text);if(!element)throw Error('Missing button: '+text);return element;};
     const state=()=>JSON.parse(JSON.parse(localStorage.getItem('portrait-project')).activeSource).world.initialGameState;
     const edit=name=>document.querySelector('[aria-label="Edit '+name+'"]');
     const portrait=name=>document.querySelector('[aria-label="Choose artwork for '+name+'"]');
     const choose=async name=>{portrait(name).click();await wait(()=>document.querySelector('.library-row')||document.querySelector('.library-picker-list strong'));document.querySelector('[aria-label="Select Library portrait"]').click();await wait(()=>[...document.querySelectorAll('button')].some(element=>element.textContent==='Use existing hosted URL'));button('Use existing hosted URL').click();};
     await window.start();await wait(()=>edit('guide'));edit('guide').click();await wait(()=>portrait('guide'));
     check(document.querySelector('textarea[aria-label="portrait Url"]'),'Missing portrait field was not offered without a schema');
     window.setEditorDraft(true);await wait(()=>window.project.draft);portrait('guide').click();await wait(()=>document.body.innerText.includes('editor draft before attaching'));check(!document.querySelector('[aria-label="Choose an asset"]'),'Portrait picker could discard an editor draft');window.setEditorDraft(false);await wait(()=>!window.project.draft);
     window.deferSave=true;await choose('guide');await wait(()=>window.finishSave);
     check(document.body.innerText.includes('Saving portrait for guide locally'),'No named saving feedback');
     check(document.querySelector('[aria-label="Choose an asset"]').innerText.includes('Applying artwork selection'),'Picker did not explain the pending association');
     check(!state().npcs.guide.portraitUrl,'Portrait was shown as saved before persistence');
     check(button('Use existing hosted URL').disabled,'Picker allowed duplicate association while saving');
     window.deferSave=false;window.finishSave();await wait(()=>!document.querySelector('[aria-label="Choose an asset"]'));
     check(state().npcs.guide.portraitUrl==='https://images.example/portrait.png','Choosing artwork did not persist the guide portrait');
     check(document.body.innerText.includes('Portrait saved locally to guide'),'No save receipt');
     check(button('Apply character edits').disabled,'Portrait was left as an unapplied form draft');
     edit('other').click();await wait(()=>portrait('other'));check(!state().npcs.other.portraitUrl,'Guide art was saved to another NPC');
     edit('guide').click();await wait(()=>portrait('guide'));check(document.querySelector('textarea[aria-label="portrait Url"]').value==='https://images.example/portrait.png','Portrait disappeared after character navigation');
     const oldGuide=edit('guide');window.reopen();await wait(()=>edit('guide')&&edit('guide')!==oldGuide);edit('guide').click();await wait(()=>portrait('guide'));check(document.querySelector('textarea[aria-label="portrait Url"]').value==='https://images.example/portrait.png','Portrait disappeared after reopening the project');
     edit('Hero').click();await wait(()=>portrait('Hero'));await choose('Hero');await wait(()=>!document.querySelector('[aria-label="Choose an asset"]'));
     check(state().premadeCharacters[0].portraitUrl==='https://images.example/portrait.png','Playable character array path did not persist');
     edit('other').click();await wait(()=>portrait('other'));const draft=document.querySelector('textarea[aria-label="portrait Url"]');draft.value='https://images.example/manual.png';draft.dispatchEvent(new Event('input',{bubbles:true}));portrait('other').click();await wait(()=>document.body.innerText.includes('Apply or discard your character edits first'));check(!document.querySelector('[aria-label="Choose an asset"]'),'Picker discarded a pending character edit');button('Discard edits').click();
     window.rejectSave=true;await choose('other');await wait(()=>document.body.innerText.includes('Fixture local save failed'));
     check(document.querySelector('[aria-label="Choose an asset"]'),'Failed assignment closed the picker');
     check(!state().npcs.other.portraitUrl,'Failed assignment changed the saved project');
     check(!document.body.innerText.includes('Portrait saved locally to other'),'Failed assignment reported success');
     window.rejectSave=false;button('Use existing hosted URL').click();await wait(()=>!document.querySelector('[aria-label="Choose an asset"]'));check(state().npcs.other.portraitUrl==='https://images.example/portrait.png','Retrying a failed local save did not attach');
     portrait('other').click();await wait(()=>document.querySelector('.library-picker-list strong'));document.querySelector('[aria-label="Select Library portrait"]').click();await wait(()=>[...document.querySelectorAll('button')].some(element=>element.textContent==='Use existing hosted URL'));
     const beforeChange=window.project.activeSource;window.mutateWorld();await wait(()=>window.project.activeSource!==beforeChange);button('Use existing hosted URL').click();await wait(()=>document.body.innerText.includes('character or world changed'));button('Close').click();
     window.showArtwork();await wait(()=>document.querySelector('[aria-label="Artwork destinations"]'));
     const destination=name=>[...document.querySelectorAll('.artwork-destination-list button')].find(element=>element.querySelector('strong')?.textContent===name);
     destination('Coast').click();await wait(()=>document.querySelector('[aria-label="Artwork hosted URL"]'));
     const input=document.querySelector('[aria-label="Artwork hosted URL"]');const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setValue.call(input,'https://images.example/coast.png');input.dispatchEvent(new Event('input',{bubbles:true}));
     button('Attach hosted URL locally').click();await wait(()=>state().regions.coast.images?.map?.imageUrl==='https://images.example/coast.png');
     await wait(()=>document.body.innerText.includes('Artwork saved locally to Coast'));
     destination('Port').click();await wait(()=>document.querySelector('.artwork-destination-editor h3')?.textContent==='Port');destination('Coast').click();await wait(()=>document.querySelector('.artwork-destination-editor h3')?.textContent==='Coast'&&destination('Coast')?.innerText.includes('Image attached'));check(state().regions.coast.images.map.imageUrl==='https://images.example/coast.png','Region image disappeared after destination navigation');
     const oldCoast=destination('Coast');window.reopen();await wait(()=>destination('Coast')&&destination('Coast')!==oldCoast);destination('Coast').click();await wait(()=>document.querySelector('.artwork-destination-editor h3')?.textContent==='Coast'&&destination('Coast')?.innerText.includes('Image attached'));check(state().regions.coast.images.map.imageUrl==='https://images.example/coast.png','Region image disappeared after reopening the project');
     destination('Port').click();await wait(()=>document.querySelector('.artwork-destination-editor h3')?.textContent==='Port');const nextInput=document.querySelector('[aria-label="Artwork hosted URL"]');setValue.call(nextInput,'https://images.example/port.png');nextInput.dispatchEvent(new Event('input',{bubbles:true}));
     window.deferDetails=true;button('Attach hosted URL locally').click();await wait(()=>window.finishDetails);window.mutateWorld();await new Promise(resolve=>setTimeout(resolve,30));window.deferDetails=false;window.finishDetails();
     await wait(()=>document.body.innerText.includes('world changed'));check(!state().locations.port.images,'Stale artwork assignment changed the new world');
     check(JSON.parse(localStorage.getItem('portrait-project')).activeSource.includes('90071992547409931234'),'Image assignment damaged exact source values');
     check(!window.calls.some(method=>['imageGenerate','creatorRequest'].includes(method)),'Reusing artwork generated or uploaded without approval');
    })()`)});}finally{window.destroy();}
   }).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
  `);
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const result=spawnSync(path.resolve('node_modules/electron/dist/electron'),['--no-sandbox',path.join(directory,'run.cjs')],{env:environment,encoding:'utf8',timeout:70000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr+(result.error?'\n'+result.error.message:''));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
