const {app,BrowserWindow,ipcMain}=require('electron');
const {buildSync}=require('esbuild');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const output=path.resolve('.build-tools/responsive-qa');
fs.mkdirSync(output,{recursive:true});
const runDirectory=fs.mkdtempSync(path.join(output,'run-'));
app.setPath('userData',path.join(runDirectory,'user-data'));
buildSync({entryPoints:{service:'hosts/desktop/service.ts',features:'packages/core/features.ts'},bundle:true,platform:'node',format:'cjs',outdir:runDirectory,outExtension:{'.js':'.cjs'},logLevel:'silent'});
const {Service}=require(path.join(runDirectory,'service.cjs'));
const {mapEdit}=require(path.join(runDirectory,'features.cjs'));
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
 for(const [name,selector] of [['Mods','.mod-row'],['Publish','.publication-workspace'],['Map','.map-viewport']]){
  await navigate(name,`document.querySelector(${JSON.stringify(selector)})`);
  await check(name.toLowerCase(),screen,async()=>{
   const layout=await bounds();assert.ok(layout.rootWidth<=layout.width+1,name+' overflows horizontally: '+JSON.stringify(layout));
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

async function verifyVoyageProjectActions(){
 const originalVoyage=service.voyage,originalSecrets=service.secrets,reads=[];
 try{
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
   await evaluate("document.querySelector('.header-actions .mobile-menu summary').click()");
   await evaluate("[...document.querySelectorAll('.mobile-menu-items button')].find(button=>button.textContent==='Close project').click()");
   await waitFor("document.querySelector('.projects-page')");
   await waitFor("!document.querySelector('.project-sources button[disabled]')");
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
   if(!localMethods.has(method))throw Error('External action blocked by responsive layout test: '+method);
   return service.request(method,payload);
  });
  window.webContents.debugger.attach('1.3');
  await window.loadFile(path.resolve('dist/index.html'));
  await waitFor("document.querySelector('.workspace-tools')");
  for(const config of screens.filter(config=>!process.env.VOYAGE_LAYOUT_CASES||process.env.VOYAGE_LAYOUT_CASES.split(',').includes(config.name)))await verifyScreen(config,created.project.id);
  await verifyLocalProjectActions();
  await verifyVoyageProjectActions();
  await verifyMapGestures(created.project.id);
  if(!process.env.VOYAGE_LAYOUT_CASES)await verifyLiveResize(created.project.id);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`${report.cases.length} viewports; ${report.failures.length} failed checks. Report: ${path.join(output,'report.json')}`);
  clearTimeout(timeout);app.exit(report.failures.length?1:0);
 }catch(error){console.error(error);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({...report,fatal:error.message},null,2));clearTimeout(timeout);app.exit(1);}
});
