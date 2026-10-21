const {app,BrowserWindow,ipcMain}=require('electron');
const {buildSync}=require('esbuild');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const output=path.resolve('.build-tools/responsive-qa');
fs.mkdirSync(output,{recursive:true});
const runDirectory=fs.mkdtempSync(path.join(output,'run-'));
app.setPath('userData',path.join(runDirectory,'user-data'));
buildSync({entryPoints:{service:'hosts/desktop/service.ts',features:'packages/core/features.ts',grading:'packages/core/world-grading.ts'},bundle:true,platform:'node',format:'cjs',outdir:runDirectory,outExtension:{'.js':'.cjs'},logLevel:'silent'});
const {Service}=require(path.join(runDirectory,'service.cjs'));
const {mapEdit}=require(path.join(runDirectory,'features.cjs'));
const {bundledRubric}=require(path.join(runDirectory,'grading.cjs'));
const screens=[
 [280,600],[320,568],[359,640],[360,640],[361,640],[375,667],
 [390,844],[411,915],[412,915],[413,915],[430,932],[480,960],
 [568,320],[667,375],[844,390],[915,412],[320,360],
 [759,700],[760,700],[761,700],[1280,900]
].map(([width,height])=>({name:`${width}x${height}`,width,height,touch:width<1000}));
screens.push({name:'browser-zoom-150',width:412,height:915,touch:true,zoom:1.5});
screens.push({name:'long-shortcuts',width:320,height:568,touch:true,longShortcuts:true});
screens.push({name:'portrait-safe-areas',width:390,height:844,touch:true,safe:{top:24,bottom:34,left:0,right:0}});
screens.push({name:'landscape-safe-areas',width:844,height:390,touch:true,safe:{top:0,bottom:20,left:44,right:44}});
screens.push({name:'enlarged-text-200',width:320,height:600,touch:true,textScale:2});
const report={engine:process.versions.chrome,cases:[],failures:[]};
const timeout=setTimeout(()=>{console.error('Responsive smoke timed out');app.exit(1);},180000);
let window,service;

async function evaluate(script){return window.webContents.executeJavaScript(script);}
async function waitFor(expression){
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){if(await evaluate(`Boolean(${expression})`))return;await new Promise(resolve=>setTimeout(resolve,40));}
 throw Error('UI did not become ready: '+expression);
}
async function settled(){await evaluate('new Promise(resolve=>setTimeout(()=>{document.body.getBoundingClientRect();resolve();},0))');}
async function captureEvidence(filename){
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 fs.writeFileSync(path.join(output,filename),(await window.webContents.capturePage()).toPNG());
}
async function navigate(name,ready){
 await evaluate(`(()=>{const button=[...document.querySelectorAll('.tools-menu-items button')].find(button=>button.querySelector('span').textContent===${JSON.stringify(name)});if(!button)throw Error('Missing tool');button.click();})()`);
 await waitFor(ready);await settled();
}
async function check(name,screen,fn){
 try{await fn();screen.passed.push(name);}
 catch(error){
  const failure={screen:screen.name,check:name,error:error.message};report.failures.push(failure);
  console.error(`${screen.name}: ${name}: ${error.message}`);
  if(report.failures.length<=8){try{await captureEvidence(`${screen.name}-${name}.png`);}catch{}}
 }
}
async function bounds(){
 return evaluate(`(()=>{const root=document.querySelector('.adaptive-app'),mode=document.querySelector('.mobile-workspace-mode'),r=mode.getBoundingClientRect();return {width:innerWidth,height:innerHeight,rootWidth:root.scrollWidth,documentWidth:document.documentElement.scrollWidth,modeVisible:getComputedStyle(mode).display!=='none',modeTop:r.top,modeBottom:r.bottom};})()`);
}
async function applyViewport(config){
 window.webContents.setZoomFactor(1);
 window.setContentSize(config.width,config.height);
 await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:config.width,height:config.height,deviceScaleFactor:1,mobile:config.touch});
 await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:config.touch,maxTouchPoints:5});
 if(config.zoom)window.webContents.setZoomFactor(config.zoom);
}
async function verifyScreen(config,projectId){
 await applyViewport(config);
 const preferences=config.longShortcuts?{mobile:['editor','systems','providers','review']}:null;
 await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(projectId)});localStorage.setItem('voyage-navigation-v1',${JSON.stringify(JSON.stringify(preferences))});location.reload()`);
 await waitFor("document.querySelector('.content-group-other')");await settled();
 if(config.safe)await evaluate(`(()=>{const app=document.querySelector('.adaptive-app');for(const [side,value] of Object.entries(${JSON.stringify(config.safe)}))app.style.setProperty('--app-safe-'+side,value+'px');})()`);
 if(config.textScale)await evaluate(`(()=>{
  const originals=new WeakMap();
  const apply=()=>{
   const elements=[...document.querySelectorAll('*')].filter(element=>element instanceof HTMLElement);
   for(const element of elements){if(!originals.has(element))originals.set(element,{font:element.style.fontSize,line:element.style.lineHeight});const original=originals.get(element);element.style.fontSize=original.font;element.style.lineHeight=original.line;}
   const sizes=elements.map(element=>{const style=getComputedStyle(element);return {element,font:parseFloat(style.fontSize),line:style.lineHeight};});
   for(const {element,font,line} of sizes){element.style.fontSize=font*${config.textScale}+'px';if(line!=='normal')element.style.lineHeight=parseFloat(line)*${config.textScale}+'px';}
  };
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
 })()`);
 await settled();
 const screen={...config,passed:[],viewport:await bounds()};report.cases.push(screen);
 const compact=screen.viewport.width<=760||(config.touch&&screen.viewport.height<=500);
 await check('shell',screen,async()=>{
  assert.equal(screen.viewport.modeVisible,compact,'Phone mode must follow width and short touch screens');
  assert.ok(screen.viewport.rootWidth<=screen.viewport.width+1,'App overflows horizontally: '+JSON.stringify(screen.viewport));
  if(compact){assert.ok(screen.viewport.modeBottom<=screen.viewport.height+1,'Mode bar is below viewport');assert.ok(screen.viewport.modeTop>=0,'Mode bar is above viewport');}
 });
 if(compact)await check('shortcut-labels',screen,async()=>{
  const labels=await evaluate(`(()=>{return [...document.querySelectorAll('.mobile-primary span')].map(label=>({text:label.textContent,width:label.clientWidth,content:label.scrollWidth}));})()`);
  for(const label of labels)assert.ok(label.content<=label.width+1,'Truncated shortcut '+JSON.stringify(label));
 });
 await check('content-scroll',screen,async()=>{
  await evaluate("document.querySelector('.content-group-other').open=true");await settled();
  const layout=await evaluate(`(()=>{const list=document.querySelector('.children');list.scrollTop=100000;const last=[...list.querySelectorAll('.content-field')].find(button=>button.querySelector('span').textContent.startsWith('layoutField39'));return {scrollTop:list.scrollTop,listBottom:list.getBoundingClientRect().bottom,lastBottom:last.getBoundingClientRect().bottom,left:list.getBoundingClientRect().left,right:list.getBoundingClientRect().right};})()`);
  assert.ok(layout.scrollTop>0,'Expanded content does not scroll: '+JSON.stringify(layout));
  if(compact)assert.ok(layout.lastBottom<=screen.viewport.modeTop+1,'Last field is behind the mode bar: '+JSON.stringify(layout));
  if(config.safe)assert.ok(layout.left>=config.safe.left-1&&layout.right<=screen.viewport.width-config.safe.right+1,'Content extends under a side cutout: '+JSON.stringify(layout));
 });
 await evaluate("[...document.querySelectorAll('.content-group-other .content-field')].find(button=>button.querySelector('span').textContent.startsWith('layoutField39')).click()");
 await waitFor("document.querySelector('.editor-layout.mobile-editing') && document.querySelector('.mobile-editor-nav strong')?.textContent==='layoutField39' && document.querySelector('.structured-editor textarea')");await settled();
 await check('editor',screen,async()=>{
  const layout=await evaluate(`(()=>{const field=document.querySelector('.structured-editor textarea');field.focus();field.scrollIntoView({block:'start'});const r=field.getBoundingClientRect(),editor=document.querySelector('.editor-main').getBoundingClientRect(),actions=document.querySelector('.editor-actions').getBoundingClientRect();const toolbar=document.querySelector('.editor-toolbar'),t=toolbar.getBoundingClientRect();return {toolbarBottom:t.bottom,toolbarContentBottom:Math.max(...[...toolbar.children].map(child=>child.getBoundingClientRect().bottom)),fieldTop:r.top,editorTop:editor.top,visible:Math.max(0,Math.min(r.bottom,editor.bottom,actions.top)-Math.max(r.top,editor.top)),left:actions.left,right:actions.right,buttons:[...document.querySelectorAll('.editor-actions>button,.editor-more-actions>summary')].map(button=>{const r=button.getBoundingClientRect();return {label:button.textContent||button.getAttribute('aria-label'),left:r.left,right:r.right,height:r.height};})};})()`);
  assert.ok(layout.visible>=36,'Focused field is covered: '+JSON.stringify(layout));
  assert.ok(layout.toolbarContentBottom<=layout.toolbarBottom+1,'Toolbar content overlaps the next row: '+JSON.stringify(layout));
  assert.ok(layout.fieldTop>=layout.editorTop-1,'First text line is scrolled out of view: '+JSON.stringify(layout));
  assert.ok(layout.left>=-1&&layout.right<=screen.viewport.width+1,'Actions overflow: '+JSON.stringify(layout));
  if(compact)for(const button of layout.buttons){assert.ok(button.left>=-1&&button.right<=screen.viewport.width+1,'Action is outside the screen: '+JSON.stringify(button));assert.ok(button.height>=43,'Touch target is too small: '+JSON.stringify(button));}
 });
 if(process.env.VOYAGE_LAYOUT_SCREENSHOTS==='1')await captureEvidence(`${config.name}-editor-verified.png`);
 if(compact)await check('editor-menu',screen,async()=>{
  await evaluate("document.querySelector('.editor-more-actions summary').click()");await settled();
  const menu=await evaluate(`(()=>{const menu=document.querySelector('.editor-more-actions .editor-secondary-actions'),r=menu.getBoundingClientRect(),first=menu.querySelector('button'),f=first.getBoundingClientRect(),hit=document.elementFromPoint(f.x+f.width/2,f.y+f.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,firstHittable:!!hit&&(hit===first||first.contains(hit))};})()`);
  await evaluate("document.querySelector('.editor-more-actions').open=false");
  assert.ok(menu.top>=-1&&menu.bottom<=screen.viewport.height+1&&menu.left>=-1&&menu.right<=screen.viewport.width+1,'Menu leaves viewport: '+JSON.stringify(menu));
  assert.ok(menu.firstHittable,'Editor menu is clipped or covered: '+JSON.stringify(menu));
 });
 await navigate('Planning',"document.querySelector('.planning-layout')");
 await check('chat',screen,async()=>{
  const layout=await evaluate(`(()=>{const field=document.querySelector('.composer textarea');field.scrollIntoView({block:'center'});const r=field.getBoundingClientRect(),mode=document.querySelector('.mobile-workspace-mode');return {top:r.top,bottom:r.bottom,width:document.querySelector('.adaptive-app').scrollWidth,limit:getComputedStyle(mode).display==='none'?innerHeight:mode.getBoundingClientRect().top};})()`);
  assert.ok(layout.width<=screen.viewport.width+1,'Chat overflows horizontally: '+JSON.stringify(layout));
  assert.ok(layout.top>=-1&&layout.bottom<=layout.limit+1,'Chat composer is unreachable: '+JSON.stringify(layout));
 });
 for(const [name,selector] of [['World grading','.grading-page'],['Mods','.mod-row'],['Publish','.publication-workspace'],['Map','.map-viewport']]){
  await navigate(name,`document.querySelector(${JSON.stringify(selector)})`);
  await check(name.toLowerCase(),screen,async()=>{
   const layout=await bounds();assert.ok(layout.rootWidth<=layout.width+1,name+' overflows horizontally: '+JSON.stringify(layout));
   if(name==='World grading'){
    const control=await evaluate(`(()=>{const button=document.querySelector('.grading-page button[type=submit]');button.scrollIntoView({block:'center'});const rect=button.getBoundingClientRect(),mode=document.querySelector('.mobile-workspace-mode');return {top:rect.top,bottom:rect.bottom,limit:getComputedStyle(mode).display==='none'?innerHeight:mode.getBoundingClientRect().top};})()`);
    assert.ok(control.top>=-1&&control.bottom<=control.limit+1,'Grading action is unreachable: '+JSON.stringify(control));
   }
   if(name==='Publish'&&compact)assert.equal(await evaluate("document.querySelector('.publication-checks').open"),false,'Publishing checks should start collapsed in phone mode');
   if(compact){const selected=await evaluate(`(()=>{const button=document.querySelector('.workspace-shortcuts .mobile-primary[aria-current="page"]');if(!button)return null;const r=button.getBoundingClientRect(),list=button.parentElement.getBoundingClientRect();return {left:r.left,right:r.right,listLeft:list.left,listRight:list.right};})()`);if(selected)assert.ok(selected.left>=selected.listLeft-1&&selected.right<=selected.listRight+1,'Active shortcut is outside the scroll area: '+JSON.stringify(selected));}
  });
 }
 await check('tool-menu',screen,async()=>{
  await evaluate("document.querySelector('.tools-menu summary').click()");await settled();
  const menu=await evaluate(`(()=>{const menu=document.querySelector('.tools-menu-items');menu.scrollTop=100000;const r=menu.getBoundingClientRect(),last=menu.querySelector('button:last-child'),b=last.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,modeTop:document.querySelector('.mobile-workspace-mode').getBoundingClientRect().top,lastHittable:!!hit&&(hit===last||last.contains(hit))};})()`);
  await evaluate("document.querySelector('.tools-menu').open=false");
  assert.ok(menu.top>=-1&&menu.bottom<=screen.viewport.height+1&&menu.left>=-1&&menu.right<=screen.viewport.width+1,'Tool menu leaves viewport: '+JSON.stringify(menu));
  assert.ok(menu.lastHittable,'Last tool is clipped or covered: '+JSON.stringify(menu));
  if(compact)assert.ok(menu.bottom<=menu.modeTop,'Tool menu overlaps the bottom mode bar: '+JSON.stringify(menu));
 });
 console.log(`${config.name}: ${screen.passed.length} checks passed`);
}

async function verifyMapArtwork(projectId){
 await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(projectId)});location.reload()`);
 await waitFor("document.querySelector('.content-group-other')");
 // Local canvas fixtures exercise actual thumbnail loading without network or model calls.
 const images=await evaluate(`(()=>{return ['Forest map','Coastal map','Mountain map'].map((name,index)=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle=['#213e35','#304d61','#514439'][index];ctx.fillRect(0,0,600,600);ctx.strokeStyle='#a9bca2';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(0,450);ctx.bezierCurveTo(220,160,320,520,600,100);ctx.stroke();ctx.fillStyle='#dce5d0';ctx.font='36px sans-serif';ctx.fillText(name,40,75);return {id:'artwork-layout-'+index,name,dataUrl:canvas.toDataURL('image/png'),created:1,prompt:'Layout fixture'};});})()`);
 for(const image of images)await service.request('featureSet',{key:'asset:'+image.id,value:JSON.stringify(image)});
 const records=images.map(image=>({id:image.id,name:image.name,aliases:[],created:1,kind:'image',mime:'image/png',storageId:image.id,remote:[],tags:[]}));
 await service.request('featureSet',{key:'asset-library',value:JSON.stringify(records)});
 const original=(await service.request('project',{id:projectId})).project.activeSource;
 report.artwork=[];
 for(const config of [{width:320,height:568,touch:true},{width:412,height:915,touch:true},{width:1280,height:900,touch:false},{width:844,height:390,touch:true}]){
  await applyViewport(config);
  await navigate('Artwork',"document.querySelector('.artwork-purpose')");
  await evaluate("[...document.querySelectorAll('.artwork-purpose button')].find(button=>button.textContent==='Map artwork').click()");
  await waitFor("document.querySelector('[aria-label=\"Artwork region\"]')");
  assert.equal(await evaluate("[...document.querySelectorAll('.map-artwork-tool')].every(tool=>!tool.open)"),true,'Advanced tools must start collapsed');
  assert.equal(await evaluate("!!document.querySelector('.region-image-target .primary')"),false,'Do not show a disabled image action before a region is selected');
  const tabs=await evaluate("[...document.querySelectorAll('.artwork-purpose button')].map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right};})");
  assert.ok(tabs.every(tab=>tab.left>=0&&tab.right<=config.width),'Artwork navigation is clipped');
  await evaluate("(()=>{const select=document.querySelector('[aria-label=\"Artwork region\"]');select.value='QA region';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("document.querySelectorAll('.region-image-tile img').length===3");
  await evaluate("document.querySelector('.region-image-thumbnails').scrollIntoView({block:'start'})");await settled();
  await waitFor("[...document.querySelectorAll('.region-image-tile img')].every(img=>img.complete&&img.naturalWidth===600)");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.region-image-thumbnails')).display"),'grid','Phone thumbnails must remain visible');
  const layout=await bounds();assert.ok(layout.rootWidth<=config.width+1,'Artwork workspace overflows: '+JSON.stringify(layout));
  await evaluate("document.querySelector('.map-artwork-workspace').scrollTop=0");await settled();
  if(config.width===412)await captureEvidence('artwork-phone.png');
  if(config.width===1280)await captureEvidence('artwork-desktop.png');
  await evaluate("document.querySelector('.region-image-tile').scrollIntoView({block:'center'})");await settled();
  const tile=await evaluate("(()=>{const tile=document.querySelector('.region-image-tile'),r=tile.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,hittable:!!hit&&(hit===tile||tile.contains(hit))};})()");
  assert.ok(tile.hittable,'Artwork tile is covered');
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:tile.x,y:tile.y,button:'left',clickCount:1});
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:tile.x,y:tile.y,button:'left',clickCount:1});
  await waitFor("document.querySelector('.media-dialog[open] .library-picker-list [aria-pressed=true]')");
  assert.equal(await evaluate("document.querySelector('.media-dialog [aria-pressed=true] strong').textContent"),'Forest map','Thumbnail selection must carry into review');
  assert.equal(await evaluate("!!document.querySelector('.library-image-picker img')"),true,'Picker must also show thumbnails');
  assert.equal(await evaluate("!!document.querySelector('.library-picker-list button button')"),false,'Image tiles cannot contain nested buttons');
  assert.equal((await service.request('project',{id:projectId})).project.activeSource,original,'Browsing must not change world data');
  if(config.width===412)await captureEvidence('artwork-picker-phone.png');
  await evaluate("document.querySelector('.media-dialog header button').click()");
  await waitFor("!document.querySelector('.media-dialog')");
  report.artwork.push({...config,thumbnails:true,reviewSelection:true,sourceUnchanged:true});
  await navigate('Map',"document.querySelector('.map-viewport')");
 }
 // Reusing a hosted URL still requires an explicit review action, without an upload.
 records[0].remote=[{url:'https://artwork-qa.invalid/forest.png',state:'existing',created:1,target:'REGION_MAP_IMAGE'}];
 await service.request('featureSet',{key:'asset-library',value:JSON.stringify(records)});
 await navigate('Artwork',"document.querySelector('.artwork-purpose')");
 await evaluate("[...document.querySelectorAll('.artwork-purpose button')].find(button=>button.textContent==='Map artwork').click()");
 await waitFor("document.querySelector('[aria-label=\"Artwork region\"]')");
 await evaluate("(()=>{const select=document.querySelector('[aria-label=\"Artwork region\"]');select.value='QA region';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor("document.querySelector('.region-image-tile')");
 await evaluate("document.querySelector('.region-image-tile').click()");
 await waitFor("document.querySelector('.media-dialog .primary')");
 assert.equal((await service.request('project',{id:projectId})).project.activeSource,original);
 await evaluate("document.querySelector('.media-dialog .primary').click()");
 await waitFor("!document.querySelector('.media-dialog')&&document.querySelector('.region-image-assignment [role=status]')");
 const assigned=(await service.request('project',{id:projectId})).project.activeSource;
 assert.equal(mapEdit(original,'set-field',{kind:'region',key:'QA region',field:'imageUrl',value:records[0].remote[0].url}),assigned,'Review must update only the chosen region');
 console.log('Map artwork: phone/desktop thumbnails, review, cancel, and explicit hosted assignment passed');
}

async function verifyWorldGrading(){
 const source=JSON.stringify({title:'Grading layout fixture',storyStarts:{opening:'Open the gate.'}});
 const project=(await service.request('create',{name:'Grading layout fixture',source})).project;
 const reportInput={
  summary:'The opening is concrete, but the source needs traceable design contracts before its quality can be bounded.',strengths:['A concrete opening is named.'],
  criteria:bundledRubric.criteria.map(criterion=>({id:criterion.id,grade:'NE',feedback:'Required source evidence is incomplete.',evidence:[],improvement:'Specify this design in the source.'})),
  gates:bundledRubric.gates.map(gate=>({id:gate.id,status:'NE',explanation:'Static gate evidence is incomplete.'})),
  diagnostics:Object.fromEntries(['cover','title','blurb','storyStart','characterCreator'].map(key=>[key,{score:'NE',explanation:'Required diagnostic evidence is missing.'}])),
  fixes:[{id:'opening',criterionIds:['A1'],priority:'high',title:'Make the opening actionable',why:'Name a decision and consequence.',requirements:['Add an immediately usable affordance.'],allowedPaths:[['storyStarts']]}],
  missingEvidence:['Cover pixels and complete design contracts are missing.'],promises:['Open the gate.'],intent:'Original world.'
 };
 service.store.dispatch(project.id,{type:'prepareTask',id:'grading-layout',attempt:'one',kind:'plan',grading:{path:'universal',overlay:'standard',rationale:'Cross-genre layout verification.'}});
 service.store.dispatch(project.id,{type:'taskRunning',taskId:'grading-layout',attempt:'one'});
 service.store.dispatch(project.id,{type:'taskDone',taskId:'grading-layout',attempt:'one',text:JSON.stringify(reportInput)});
 for(const config of [{width:320,height:568,touch:true},{width:412,height:915,touch:true},{width:1280,height:900,touch:false}]){
  await applyViewport(config);
  await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(project.id)});location.reload()`);
  await waitFor("document.querySelector('.workspace-tools')");
  await navigate('World grading',"document.querySelector('.grading-report')");
  assert.equal(await evaluate("document.querySelectorAll('.grading-score').length"),2);
  assert.ok((await bounds()).rootWidth<=config.width+1,'Grading report overflows at '+config.width);
  await evaluate("document.querySelector('.grading-score').scrollIntoView({block:'start',behavior:'instant'})");
  const scoreBounds=await evaluate("(()=>{const rect=document.querySelector('.grading-score').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};})()");
  assert.ok(scoreBounds.top>=0&&scoreBounds.top<config.height-100,'Score cannot be reached at '+config.width+': '+JSON.stringify(scoreBounds));
  await captureEvidence(`grading-report-${config.width}.png`);
 }
 const importFile=async contents=>{
  await evaluate(`(()=>{const field=document.querySelector('.grading-page input[type=file]'),transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(contents)}],'rubric.json',{type:'application/json'}));field.files=transfer.files;field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 };
 await importFile('{"version":"broken"}');
 await waitFor("document.querySelector('.grading-error')");
 assert.equal(service.store.project(project.id).grading.rubric,undefined,'Invalid import replaced rubric');
 const updated={...bundledRubric,title:'Updated layout rubric',version:'1.6-layout'};
 await importFile(JSON.stringify(updated));
 await waitFor("document.querySelector('.grading-page').textContent.includes('Rubric changed · stale report')");
 assert.equal(await evaluate("[...document.querySelectorAll('.grading-page button')].find(button=>button.textContent==='Suggest Work Order').disabled"),true);
 await evaluate("[...document.querySelectorAll('.grading-page button')].find(button=>button.textContent==='Reset to built-in').click()");
 await waitFor("document.querySelector('.grading-page').textContent.includes('Rubric matches current rubric')");
 await evaluate("[...document.querySelectorAll('.grading-page button')].find(button=>button.textContent==='Suggest Work Order').click()");
 await waitFor("document.querySelector('.planning-layout')");
 assert.equal(service.store.project(project.id).workOrderProposals.length,1);
 assert.equal(service.store.project(project.id).activeSource,source);
 assert.equal(service.store.project(project.id).workOrder.objective,'');
 console.log('World grading: responsive reports, invalid/updated rubric imports, reset, stale fixes, and optional unapproved Work Order passed');
}

async function verifyMagicWand(){
 for(const config of [{width:320,height:568,touch:true},{width:1280,height:900,touch:false}]){
  const source=JSON.stringify({worldBackground:'',title:'Authored world title',exact:9007199254740991});
  const project=(await service.request('create',{name:'Magic wand fixture',source})).project;
  await applyViewport(config);
  await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(project.id)});location.reload()`);
  await waitFor("document.querySelector('[aria-label=\"World Background\"]')");
  await evaluate("[...document.querySelectorAll('.field-fill-wand')].find(button=>/Generate missing text for World Background/i.test(button.getAttribute('aria-label'))).click()");
  await waitFor("document.querySelector('.field-fill-dialog[open]')");
  const dialog=await evaluate("(()=>{const rect=document.querySelector('.field-fill-dialog').getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};})()");
  assert.ok(dialog.left>=-1&&dialog.right<=config.width+1&&dialog.top>=-1&&dialog.bottom<=config.height+1,'Magic wand dialog leaves viewport: '+JSON.stringify(dialog));
  await evaluate("(()=>{const field=document.querySelector('.field-fill-dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Write a concise coastal setting.');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor("!document.querySelector('.field-fill-dialog button[type=submit]').disabled");
  await evaluate("document.querySelector('.field-fill-dialog button[type=submit]').click()");
  await waitFor("document.querySelector('[aria-label=\"World Background\"]').value==='Generated coastal context.'");
  assert.equal(service.store.project(project.id).activeSource,source,'Generation modified applied world');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Title\"]').value"),'Authored world title');
  assert.equal(await evaluate("!!document.querySelector('.field-fill-completed')"),true,'Completed field is not highlighted');
  await evaluate("document.querySelector('.field-fill-completed').scrollIntoView({block:'center'})");
  await captureEvidence(`magic-wand-${config.width}.png`);
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Undo generated text').click()");
  await waitFor("document.querySelector('[aria-label=\"World Background\"]').value===''");
  await evaluate("[...document.querySelectorAll('.field-fill-wand')].find(button=>/Generate missing text for World Background/i.test(button.getAttribute('aria-label'))).click()");
  await waitFor("document.querySelector('.field-fill-dialog[open]')");
  await evaluate("(()=>{const field=document.querySelector('.field-fill-dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'fixture delayed completion');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('.field-fill-dialog button[type=submit]').click()");
  await waitFor("[...document.querySelectorAll('button')].some(button=>button.textContent==='Cancel generation')");
  await evaluate("(()=>{const field=document.querySelector('[aria-label=\"World Background\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Authored while generation runs');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor("document.querySelector('.field-fill-status').textContent.includes('0 filled')");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"World Background\"]').value"),'Authored while generation runs','Async completion overwrote a manual edit');
  assert.equal(service.store.project(project.id).chat.length,0,'Completion leaked into Planning');
  assert.equal(service.store.project(project.id).activeSource,source);
 }
 console.log('Magic wand: phone/desktop generation, highlight, authored preservation, draft-only changes, Undo, and asynchronous manual-edit preservation passed');
}

async function verifyMapGestures(projectId){
 await applyViewport({width:412,height:915,touch:true});
 await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(projectId)});location.reload()`);
 await waitFor("document.querySelector('.content-group-other')");
 await navigate('Map',"document.querySelector('.map-viewport')");
 await evaluate("document.querySelector('.map-viewport').scrollIntoView({block:'start'})");await settled();
 await waitFor("Number(document.querySelector('.map-viewport')?.dataset.cellSize)>0");
 const geometry=await evaluate(`(()=>{const view=document.querySelector('.map-viewport'),r=view.getBoundingClientRect();return {left:r.left,top:r.top,width:view.clientWidth,height:view.clientHeight,x:Number(view.dataset.centerX),y:Number(view.dataset.centerY),size:Number(view.dataset.cellSize)};})()`);
 const original=await service.request('project',{id:projectId});
 const x=geometry.left+geometry.width/2,y=geometry.top+geometry.height/2;
 const touch=(type,points)=>window.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
 await touch('touchStart',[[1,x-40,y],[2,x+40,y]]);
 await touch('touchMove',[[1,x-50,y+8],[2,x+70,y+8]]);await settled();
 const camera=await evaluate(`(()=>{const view=document.querySelector('.map-viewport');return {x:Number(view.dataset.centerX),y:Number(view.dataset.centerY),size:Number(view.dataset.cellSize)};})()`);
 assert.ok(Math.abs(camera.size-geometry.size*1.5)<1,'Pinch did not change map zoom: '+JSON.stringify({geometry,camera}));
 assert.ok(Math.abs(camera.x+10/camera.size-geometry.x)<.01&&Math.abs(camera.y-8/camera.size-geometry.y)<.01,'Pinch lost its world anchor: '+JSON.stringify({geometry,camera}));
 // Lifting one finger must let the remaining finger pan without a jump.
 await touch('touchEnd',[[2,x+70,y+8]]);
 await touch('touchMove',[[1,x-30,y+8]]);await settled();
 await waitFor(`Number(document.querySelector('.map-viewport')?.dataset.centerX)!==${camera.x}`);
 const continued=await evaluate("Number(document.querySelector('.map-viewport').dataset.centerX)");
 assert.ok(Math.abs(continued-(camera.x-20/camera.size))<.01,'One-finger continuation jumped after pinch: '+JSON.stringify({camera,continued,expected:camera.x-20/camera.size}));
 await touch('touchCancel',[]);await settled();
 assert.ok(await evaluate("!!document.querySelector('.map-viewport')&&!document.querySelector('.map-viewport.is-panning')"),'Pinch opened a region or left a stuck drag');
 const stored=await service.request('project',{id:projectId});
 assert.equal(stored.project.activeSource,original.project.activeSource,'Camera gestures changed world data');
 report.gestures={pinch:true,anchor:true,oneFingerContinuation:true,cancel:true,sourceUnchanged:true};
 console.log('Map gestures: pinch, anchor, continuation, cancellation, and unchanged source passed');
}

async function verifyLiveResize(projectId){
 await applyViewport({width:320,height:568,touch:true});
 await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(projectId)});localStorage.setItem('voyage-navigation-v1','null');location.reload()`);
 await waitFor("document.querySelector('.content-group-other')");
 await evaluate("document.querySelector('.content-group-other').open=true;[...document.querySelectorAll('.content-group-other .content-field')].find(button=>button.querySelector('span').textContent.startsWith('layoutField39')).click()");
 await waitFor("document.querySelector('.editor-layout.mobile-editing') && document.querySelector('.mobile-editor-nav strong')?.textContent==='layoutField39' && document.querySelector('.structured-editor textarea')");
 const original=await service.request('project',{id:projectId});
 const draft='Draft survives rotation and resizing';
 await evaluate(`(()=>{const field=document.querySelector('.structured-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(draft)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await waitFor("document.querySelector('[role=status][aria-label=\"Draft saved locally\"]')");
 report.reflow=[];
 for(const config of [{width:844,height:390,touch:true},{width:761,height:700,touch:true},{width:1280,height:900,touch:false},{width:360,height:640,touch:true}]){
  await applyViewport(config);const compact=config.width<761||(config.touch&&config.height<501);
  await waitFor(`Boolean(document.querySelector('.editor-more-actions'))===${compact}`);await settled();
  const value=await evaluate("document.querySelector('.structured-editor textarea').value");
  assert.equal(value,draft,'Resize discarded the open draft at '+JSON.stringify(config));
  report.reflow.push(config);
 }
 const stored=await service.request('project',{id:projectId});
 assert.equal(stored.project.draft.text,JSON.stringify(draft),'Resized editor draft was not saved locally');
 assert.equal(stored.project.activeSource,original.project.activeSource,'Resize applied or changed the active world');
 console.log('Live reflow: draft retained across landscape, desktop breakpoint, and portrait');
}

async function verifyLocalProjectActions(){
 const created=await service.request('create',{name:'Project lifecycle QA',source:'{"title":"Lifecycle QA"}'});
 const draft={type:'draft',path:['title'],text:'"Unapplied local title"',baseHash:require('node:crypto').createHash('sha256').update(created.project.activeSource).digest('hex')};
 await service.request('command',{id:created.project.id,command:draft});
 await applyViewport({width:390,height:844,touch:true});
 await evaluate("localStorage.removeItem('voyage-project')");
 await window.loadFile(path.resolve('dist/index.html'));
 await waitFor("document.querySelector('.projects-page')");
 await waitFor("document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"] button:not([disabled])')");
 await evaluate(`(()=>{const card=[...document.querySelectorAll('.local-project-card')].find(card=>card.getAttribute('aria-label')==='Project lifecycle QA');card.querySelector('.project-card').click();})()`);
 await waitFor("document.querySelector('.world-editor')");
 await waitFor("document.querySelector('.header-actions .mobile-menu button:not([disabled])')");
 await evaluate("document.querySelector('.header-actions .mobile-menu summary').click()");
 await evaluate("[...document.querySelectorAll('.mobile-menu-items button')].find(button=>button.textContent==='Close project').click()");
 await waitFor("document.querySelector('.projects-page')");
 await waitFor("document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"] button:not([disabled])')");
 assert.equal(await evaluate("localStorage.getItem('voyage-project')"),null,'Closing must clear automatic reopening');
 assert.equal(service.store.project(created.project.id).activeSource,created.project.activeSource,'Closing must preserve the local world');
 assert.equal(service.store.project(created.project.id).draft.text,draft.text,'Closing must preserve unapplied local edits');
 await evaluate("(()=>{const card=[...document.querySelectorAll('.local-project-card')].find(card=>card.getAttribute('aria-label')==='Project lifecycle QA');[...card.querySelectorAll('button')].find(button=>button.textContent==='Move to trash').click();})()");
 await waitFor("!document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"]')");
 await evaluate("(()=>{const filter=document.querySelector('[aria-label=\"Project status filter\"]');filter.value='trashed';filter.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await waitFor("document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"]')");
 await waitFor("document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"] button:not([disabled])')");
 await evaluate("(()=>{window.confirm=()=>false;const card=document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"]');[...card.querySelectorAll('button')].find(button=>button.textContent==='Delete permanently').click();})()");
 await settled();
 assert.equal(service.store.project(created.project.id).status,'trashed','Canceling permanent deletion must preserve the project');
 await waitFor("document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"] button:not([disabled])')");
 await evaluate("(()=>{window.confirm=()=>true;const card=document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"]');[...card.querySelectorAll('button')].find(button=>button.textContent==='Delete permanently').click();})()");
 await waitFor("!document.querySelector('.local-project-card[aria-label=\"Project lifecycle QA\"]')");
 assert.ok(!(await service.request('projects')).some(project=>project.id===created.project.id),'Deletion must remove the local project');
 console.log('Local project actions: close, trash, and confirmed permanent deletion passed');
}

async function verifyVoyageSyncLoading(){
 const originalVoyage=service.voyage,originalSecrets=service.secrets,reads=[];
 try{
  service.secrets={durable:false,get:()=> 'fixture-key',set:()=>{}};
  service.voyage=async(method,endpoint)=>{
   assert.equal(method,'GET','Loading a world must never upload or save to Voyage');reads.push(endpoint);
   if(endpoint.startsWith('/worlds?'))return {text:JSON.stringify({data:{worlds:[{shortId:'sync-one',title:'Saved world one'},{shortId:'sync-two',title:'Saved world two'}]}}),etag:''};
   const second=endpoint.endsWith('sync-two');
   return {text:JSON.stringify({data:{world:{title:second?'Saved world two':'Saved world one',description:'Saved remote content',initialGameState:{counter:42}}}}),etag:'sync-fixture'};
  };
  const starting=(await service.request('create',{name:'Existing local world',source:'{"title":"Keep this local world","description":"Local content"}'})).project;
  await applyViewport({width:412,height:915,touch:true});
  await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(starting.id)});location.reload()`);
  await waitFor("document.querySelector('.workspace-tools')");
  await navigate('Voyage sync',"document.querySelector('[aria-label=\"Voyage world ID\"]')");
  await waitFor("[...document.querySelectorAll('button')].some(button=>button.textContent==='List my worlds'&&!button.disabled)");
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='List my worlds').click()");
  await waitFor("document.querySelector('.remote-list button')?.textContent==='Load world'");
  await evaluate("document.querySelector('.remote-list button').click()");
  await waitFor("document.querySelector('.world-editor')&&document.querySelector('.workspace-world-title')?.textContent==='Saved world one'");
  const loadedId=await evaluate("localStorage.getItem('voyage-project')"),loaded=service.store.project(loadedId);
  assert.notEqual(loadedId,starting.id);assert.equal(loaded.remote.worldId,'sync-one');
  assert.equal(service.store.project(starting.id).activeSource,starting.activeSource,'Direct loading changed the previous project');
  await navigate('Voyage sync',"document.querySelector('[aria-label=\"Voyage import destination\"]')");
  await evaluate("(()=>{const select=document.querySelector('[aria-label=\"Voyage import destination\"]');select.value='current';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("document.querySelector('.remote-list button')?.textContent==='Import for review'");
  await evaluate("document.querySelectorAll('.remote-list article button')[1].click()");
  await waitFor("document.querySelector('.review-page .proposal-heading')");
  const reviewed=service.store.project(loadedId);
  assert.equal(await evaluate("localStorage.getItem('voyage-project')"),loadedId);
  assert.equal(reviewed.activeSource,loaded.activeSource,'Review import overwrote the active world');
  assert.ok(reviewed.candidates.some(candidate=>candidate.kind==='remote'&&candidate.source.includes('Saved world two')));
  assert.ok(reads.some(endpoint=>endpoint.endsWith('sync-one'))&&reads.some(endpoint=>endpoint.endsWith('sync-two')));
  console.log('Voyage sync: row click loads a saved world directly; current-project imports stay review-only; no remote writes');
 }finally{service.voyage=originalVoyage;service.secrets=originalSecrets;}
}

async function verifyAndroidWorkspaceResume(){
 const originalRequest=service.request;
 const created=await originalRequest.call(service,'create',{name:'Android resume QA',source:'{"title":"Android resume QA","worldBackground":"Saved background"}'});
 const failures=new Map([['references',1],['projects',1]]);
 let rejectNextDraft=false,holdNextDraft=false,rejectDeferredDraft;
 let notifyDeferredDraft;
 const deferredDraftStarted=new Promise(resolve=>{notifyDeferredDraft=resolve;});
 await window.webContents.debugger.sendCommand('Page.enable');
 const nativeScript=await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:'window.CapacitorCustomPlatform={name:"android"};'});
 service.request=async function(method,payload){
  const remaining=failures.get(method)||0;if(remaining){failures.set(method,remaining-1);throw Error('Resume fixture unavailable: '+method);}
  if(method==='command'&&payload.command.type==='draft'){
   if(rejectNextDraft){rejectNextDraft=false;throw Error('Pause draft fixture unavailable');}
   if(holdNextDraft){holdNextDraft=false;await new Promise((_resolve,reject)=>{rejectDeferredDraft=reject;notifyDeferredDraft();});}
  }
  return originalRequest.call(this,method,payload);
 };
 try{
  await applyViewport({width:412,height:915,touch:true});
  await evaluate(`localStorage.setItem('voyage-project',${JSON.stringify(created.project.id)});localStorage.removeItem('voyage-workspace-session-v1');location.reload()`);
  await waitFor("document.querySelector('.workspace-world-title')?.textContent==='Android resume QA'&&document.querySelector('.world-editor')");
  assert.equal(await evaluate('window.Capacitor.getPlatform()'),'android','Fixture must exercise the Android workspace path');
  await navigate('Artwork',"document.querySelector('.artwork-workspace')");
  await waitFor("JSON.parse(localStorage.getItem('voyage-workspace-session-v1'))?.tab==='artwork'");
  await evaluate('location.reload()');
  await waitFor("document.querySelector('.workspace-world-title')?.textContent==='Android resume QA'&&document.querySelector('.artwork-workspace')");
  failures.set('project',1);
  await evaluate('location.reload()');
  await waitFor("document.body.textContent.includes('Could not resume the saved world')");
  assert.equal(await evaluate("localStorage.getItem('voyage-project')"),created.project.id,'Failed restoration forgot the selected world');
  await evaluate("window.dispatchEvent(new Event('voyage-resume'))");
  await waitFor("document.querySelector('.workspace-world-title')?.textContent==='Android resume QA'&&document.querySelector('.artwork-workspace')");
  await navigate('Content',"document.querySelector('.world-editor')");
  await evaluate("(()=>{const row=[...document.querySelectorAll('.content-field')].find(button=>button.textContent.includes('worldBackground'));row.closest('details').open=true;row.click();})()");
  await waitFor("document.querySelector('.editor-layout.mobile-editing .structured-editor textarea')");
  rejectNextDraft=true;
  await evaluate("(()=>{const field=document.querySelector('.structured-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Draft before sleep');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("window.dispatchEvent(new Event('voyage-pause'))");
  await waitFor("document.body.textContent.includes('Pause draft fixture unavailable')");
  await evaluate("window.dispatchEvent(new Event('voyage-resume'))");
  await waitFor("document.querySelector('[role=status][aria-label=\"Draft saved locally\"]')");
  assert.equal(service.store.project(created.project.id).draft.text,'"Draft before sleep"');
  await evaluate('location.reload()');
  await waitFor("document.querySelector('.editor-layout.mobile-editing .structured-editor textarea')?.value==='Draft before sleep'");
  assert.equal(service.store.project(created.project.id).activeSource,created.project.activeSource,'Resume applied an unapproved draft');
  holdNextDraft=true;
  await evaluate("(()=>{const field=document.querySelector('.structured-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Deferred pause draft');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("window.dispatchEvent(new Event('voyage-pause'))");
  await deferredDraftStarted;
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Close project').click()");await settled();
  assert.equal(await evaluate("localStorage.getItem('voyage-project')"),created.project.id,'Close ignored an in-flight draft save');
  rejectDeferredDraft(Error('Deferred pause fixture unavailable'));
  await waitFor("document.body.textContent.includes('Deferred pause fixture unavailable')");
  assert.equal(await evaluate("localStorage.getItem('voyage-project')"),created.project.id,'Failed pause save closed the world');
  await evaluate("window.dispatchEvent(new Event('voyage-resume'))");
  await waitFor("document.querySelector('[role=status][aria-label=\"Draft saved locally\"]')");
  assert.equal(service.store.project(created.project.id).draft.text,'"Deferred pause draft"');
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Close project').click()");
  await waitFor("!localStorage.getItem('voyage-project')");
  await evaluate("window.dispatchEvent(new Event('voyage-resume'))");await settled();
  assert.equal(await evaluate("localStorage.getItem('voyage-project')"),null,'Wake reopened an intentionally closed world');
  console.log('Android workspace: independent restoration, saved screen, wake/save retry, deferred-save close guard, draft reload, and explicit close passed');
 }finally{service.request=originalRequest;await window.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:nativeScript.identifier});}
}

async function verifyVoyageProjectActions(){
 const originalVoyage=service.voyage,originalSecrets=service.secrets,reads=[];
 try{
  await evaluate("(()=>{const filter=document.querySelector('[aria-label=\"Project status filter\"]');filter.value='active';filter.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await evaluate("[...document.querySelectorAll('.project-sources button')].find(button=>button.textContent==='Voyage worlds').click()");
  await waitFor("[...document.querySelectorAll('.voyage-project-browser button')].some(button=>button.textContent==='Connect Voyage')");
  await evaluate("[...document.querySelectorAll('.voyage-project-browser button')].find(button=>button.textContent==='Connect Voyage').click()");
  await waitFor("document.querySelector('[aria-label=\"Voyage API key\"]')");
  await evaluate("document.querySelector('.project-switch').click()");
  await waitFor("document.querySelector('.projects-page')");
  service.secrets={durable:false,get:()=> 'fixture-key',set:()=>{}};
  service.voyage=async(method,endpoint)=>{
   assert.equal(method,'GET');reads.push(endpoint);
   if(endpoint.startsWith('/worlds?')){const type=endpoint.includes('type=mod')?'mod':'world';return {text:JSON.stringify({data:{worlds:[{shortId:'owned-'+type,title:'Owned '+type}]}}),etag:''};}
   const mod=endpoint.endsWith('owned-mod');return {text:'{"data":{"world":{"title":"Owned '+(mod?'mod':'world')+'","isMod":'+mod+',"initialGameState":{"counter":9007199254740993}}}}',etag:'fixture-v1'};
  };
  for(const kind of ['world','mod']){
   await evaluate(`[...document.querySelectorAll('.project-sources button')].find(button=>button.textContent==='${kind==='mod'?'Voyage mods':'Local projects'}').click()`);
   if(kind==='world')await evaluate("[...document.querySelectorAll('.project-sources button')].find(button=>button.textContent==='Voyage worlds').click()");
   await waitFor(`[...document.querySelectorAll('.voyage-project-browser button')].some(button=>button.textContent==='Open ${kind}'&&!button.disabled)`);
   await evaluate(`[...document.querySelectorAll('.voyage-project-browser button')].find(button=>button.textContent==='Open ${kind}').click()`);
   await waitFor("document.querySelector('.world-editor')");
   await waitFor("[...document.querySelectorAll('.mobile-menu-items button')].some(button=>button.textContent==='Close project'&&!button.disabled)");
   const id=await evaluate("localStorage.getItem('voyage-project')"),opened=service.store.project(id);
   assert.equal(opened.remote.worldId,'owned-'+kind);assert.match(opened.activeSource,/9007199254740993/);assert.equal(JSON.parse(opened.activeSource).isMod,kind==='mod');
   assert.equal(await evaluate("document.querySelector('.project-switch .workspace-world-title').textContent"),'Owned '+kind);
   assert.equal(await evaluate("document.querySelector('.project-switch .project-short-id').textContent"),'owned-'+kind);
   await evaluate("document.querySelector('.header-actions .mobile-menu summary').click()");
   await evaluate("[...document.querySelectorAll('.mobile-menu-items button')].find(button=>button.textContent==='Close project').click()");
   await waitFor("document.querySelector('.projects-page')");
   await waitFor("!document.querySelector('.project-sources button[disabled]')");
   await waitFor(`document.querySelector('.local-project-card[aria-label="Owned ${kind}"] .project-short-id')`);
   assert.equal(await evaluate(`document.querySelector('.local-project-card[aria-label="Owned ${kind}"] .project-short-id').textContent`),'owned-'+kind);
  }
  assert.ok(reads.includes('/worlds?page=0&type=world'));assert.ok(reads.includes('/worlds?page=0&type=mod'));
  console.log('Voyage project picker: connection setup, owned worlds, and owned mods passed');
 }finally{service.voyage=originalVoyage;service.secrets=originalSecrets;}
}

app.whenReady().then(async()=>{
 try{
  service=new Service(path.join(runDirectory,'workspace'),path.resolve('apps/workbench/public/references'),{durable:false,get:()=>'',set:()=>{}});
  const content=JSON.parse(fs.readFileSync('fixtures/lantern-coast.json','utf8'));
  for(let i=0;i<40;i++)content['layoutField'+i]='A long text value for checking narrow and short editor viewports.';
  content.mods=[{shortId:'responsive-layout-test',version:null}];
  let source=JSON.stringify(content);source=mapEdit(source,'add-realm',{key:'QA realm with a long name'});source=mapEdit(source,'add-region',{key:'QA region',realm:'QA realm with a long name',x:0,y:0});
  const created=await service.request('create',{name:'A world title long enough to exceed any phone header width',source});
  window=new BrowserWindow({show:false,frame:false,width:412,height:915,webPreferences:{preload:path.resolve('build/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
  const localMethods=new Set(['projects','project','references','featureGet','featureSet','assetKeys','command','history','localEditingSettings','providerSettings','connection','deleteProject','remoteWorlds','downloadWorld']);
  ipcMain.handle('workbench',async(event,method,payload)=>{
   if(event.sender!==window.webContents)throw Error('Unknown test frame');
   if(method==='auth')return {available:false};
   if(method==='appearance')return {};
   if(method==='startAgent'&&payload.fieldFill){
    const id='field-fill-'+Date.now(),attempt='fixture';
    service.store.dispatch(payload.id,{type:'prepareTask',id,attempt,kind:'plan',fieldFill:payload.fieldFill});
    service.store.dispatch(payload.id,{type:'taskRunning',taskId:id,attempt});
    const snapshot=service.store.project(payload.id).tasks[0].fieldFill;
    const complete=()=>service.store.dispatch(payload.id,{type:'taskDone',taskId:id,attempt,text:JSON.stringify(snapshot.fields.map(field=>({path:field.path,value:'Generated coastal context.'})))});
    if(payload.fieldFill.instructions==='fixture delayed completion')setTimeout(complete,500);else complete();
    return service.store.get(payload.id);
   }
   if(!localMethods.has(method))throw Error('External action blocked by responsive layout test: '+method);
   return service.request(method,payload);
  });
  window.webContents.debugger.attach('1.3');
  await window.loadFile(path.resolve('dist/index.html'));
  await waitFor("document.querySelector('.workspace-tools')");
  for(const config of screens.filter(config=>!process.env.VOYAGE_LAYOUT_CASES||process.env.VOYAGE_LAYOUT_CASES.split(',').includes(config.name)))await verifyScreen(config,created.project.id);
  await verifyLocalProjectActions();
  await verifyVoyageProjectActions();
  await verifyVoyageSyncLoading();
  await verifyAndroidWorkspaceResume();
  await verifyMapArtwork(created.project.id);
  await verifyMapGestures(created.project.id);
  if(!process.env.VOYAGE_LAYOUT_CASES)await verifyLiveResize(created.project.id);
  await verifyWorldGrading();
  await verifyMagicWand();
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`${report.cases.length} viewports; ${report.failures.length} failed checks. Report: ${path.join(output,'report.json')}`);
  clearTimeout(timeout);app.exit(report.failures.length?1:0);
 }catch(error){console.error(error);if(window)await captureEvidence('fatal.png').catch(()=>{});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({...report,fatal:error.message},null,2));clearTimeout(timeout);app.exit(1);}
});
