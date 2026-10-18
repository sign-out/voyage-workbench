import {initImageUploads} from './image-upload.js';
/** Voyage realm grid and local location map. All edits target the JSON document. */
export const MAP_MIN_CELL = 86, MAP_MAX_CELL = 210;
export function mapLabelsVisible(storage){try{return storage?.getItem('voyage-map-labels')!=='hidden';}catch{return true;}}
export function zoomMapCamera(camera, requested, point, viewport) {
 const size=Math.max(MAP_MIN_CELL,Math.min(MAP_MAX_CELL,Number.isFinite(requested)?requested:camera.size));
 const dx=point.x-viewport.width/2,dy=point.y-viewport.height/2;
 return {size,x:camera.x+dx/camera.size-dx/size,y:camera.y-dy/camera.size+dy/size};
}
export function panMapCamera(camera,dx,dy){return {...camera,x:camera.x-dx/camera.size,y:camera.y+dy/camera.size};}
export function initMapEditor({api,node,getSource,applyText,status,getProject,confirm,host:externalHost,imageUploads:externalUploads,onDirtyChange,onContextChange}) {
 const host=externalHost||document.getElementById('mapWorkbench');
 const imageUploads=externalUploads||initImageUploads({api,node,getProject,status});
 let displayStorage;try{displayStorage=globalThis.localStorage;}catch{}
 let showLabels=mapLabelsVisible(displayStorage);host.classList.toggle('map-labels-hidden',!showLabels);
 let data=null, realm='', region='', location='', view='realm', targetCell={x:0,y:0}, targetLocal={x:0,y:0}, center={x:0,y:0}, cellSize=132;
 let dirty=false;const markDirty=value=>{dirty=value;onDirtyChange?.(value);};
 const draftInput=event=>{if(event.target.closest('.map-inspector,.map-region-attachments')&&event.target.matches('input,textarea,select'))markDirty(true);};host.addEventListener('input',draftInput);
 async function canNavigate(){if(!dirty)return true;if(!await confirm('Discard unapplied map form edits? Saved local changes are kept.'))return false;markDirty(false);return true;}
 function focusInspector(){requestAnimationFrame(()=>{const inspector=host.querySelector('.map-inspector'),heading=inspector?.querySelector('h3');heading?.setAttribute('tabindex','-1');inspector?.scrollIntoView({block:'start',behavior:'instant'});heading?.focus({preventScroll:true});});}
 function focusRegion(){requestAnimationFrame(()=>host.querySelector('.map-stage')?.scrollIntoView({block:'start',behavior:'instant'}));}
 let destroyed=false;let disposeViewport=()=>{};
 const sizeLabel=value=>Number(value).toLocaleString(undefined,{maximumSignificantDigits:6,notation:value>=1e6||value<.001?'scientific':'standard'});
 function labelToggle(){
  const control=input('','checkbox');control.checked=showLabels;control.setAttribute('aria-label','Show map labels');
  control.onchange=()=>{showLabels=control.checked;host.classList.toggle('map-labels-hidden',!showLabels);try{if(!displayStorage)throw new Error('Storage unavailable');displayStorage.setItem('voyage-map-labels',showLabels?'shown':'hidden');}catch{status('Map labels changed for this session, but the preference could not be saved.');}};
  const label=node('label',undefined,'map-label-toggle');label.append(control,node('span','Show labels'));return label;
 }
 function settingsControls(){
  const prefs=node('div',undefined,'map-view-preferences');
  const feather=input('','checkbox');feather.checked=data.regionMapBorderFeatheringEnabled!==false;feather.setAttribute('aria-label','Feather region image edges');
  feather.onchange=act(()=>change('set-settings',{regionMapBorderFeatheringEnabled:feather.checked},'Region image edge feathering updated in the world.'));
  const featherLabel=node('label',undefined,'map-feather-toggle');featherLabel.append(feather,node('span','Feather image edges'));
  const slider=input(data.regionSize,'range'),number=input(data.regionSize,'number');
  slider.setAttribute('aria-label','Region width');number.setAttribute('aria-label','Region width in coordinate units');number.min='0';number.step='any';
  slider.min=String(Math.min(1,data.regionSize));slider.max=String(Math.max(1000,data.regionSize));slider.step='any';slider.value=String(data.regionSize);
  const preview=value=>{number.value=String(value);host.querySelectorAll('[data-map-scale]').forEach(el=>{el.textContent=sizeLabel(value)+' units · one region';});};
  const commit=act(async value=>{if(!Number.isFinite(value)||value<=0){number.setCustomValidity('Enter a finite, positive region width.');number.reportValidity();return;}number.setCustomValidity('');await change('set-settings',{regionSize:value},'Region width updated in the world; location coordinates were preserved.');});
  slider.oninput=()=>preview(Number(slider.value));slider.onchange=()=>commit(Number(slider.value));number.oninput=()=>number.setCustomValidity('');number.onchange=()=>commit(number.value.trim()?Number(number.value):NaN);
  const width=node('div',undefined,'map-scale-controls');width.append(node('span','Region width'),slider,number,node('span','coordinate units'));
  prefs.append(featherLabel,width,node('small','Voyage stores region width as locationSettings.regionSize in coordinate units. Location positions are not rescaled.'));return prefs;
 }
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const isUnplaced=r=>!data.realms.some(item=>item.key===r.realm)||!Number.isInteger(r.x)||!Number.isInteger(r.y);
 const safeImage=url=>typeof url==='string'&&/^https:\/\//i.test(url);
 const act=(fn)=>async(...args)=>{try{await fn(...args);}catch(error){status(error.message,true);}};
 const button=(label,fn,cls)=>{const b=node('button',label,cls);b.onclick=act(fn);return b;};
 const labeled=(label,control)=>{const wrap=node('label',undefined,'map-field');wrap.append(node('span',label),control);return wrap;};
 function input(value='',type='text'){const el=node('input');el.type=type;el.value=value??'';return el;}
 function select(options,value){const el=node('select');for(const [v,label] of options){const option=node('option',label);option.value=v;el.append(option);}el.value=value??'';return el;}
 function coordinate(control,label){if(!control.value.trim()||!control.checkValidity())throw new Error(`${label} must be a valid number.`);return Number(control.value);}
 async function change(action,payload,message){const result=await api('/api/map/edit',{text:getSource(),action,data:payload});await applyText(result.text);markDirty(false);await refresh();status(message||'Map updated in the working copy. Save locally to keep it.');}
 async function refresh(){if(dirty)return;if(!getProject()){disposeViewport();host.replaceChildren();return;}const firstLoad=data===null;try{data=await api('/api/map/inspect',{text:getSource()});if(destroyed)return;}catch(error){host.replaceChildren(node('div',`Map unavailable: ${error.message}`,'check error'));return;}
  if(!data.realms.some(r=>r.key===realm))realm=data.realms[0]?.key||'';
  if(firstLoad){const first=data.regions.find(r=>r.realm===realm&&Number.isInteger(r.x)&&Number.isInteger(r.y));if(first)center={x:first.x,y:first.y};}
  if(region&&!data.regions.some(r=>r.key===region&&(r.realm===realm||isUnplaced(r)))){region='';location='';view='realm';}
  if(location&&!data.locations.some(l=>l.key===location&&l.region===region))location='';
  draw();}
 function projectChanged(){markDirty(false);imageUploads.projectChanged();disposeViewport();cellSize=132;data=null;realm='';region='';location='';view='realm';targetCell={x:0,y:0};targetLocal={x:0,y:0};center={x:0,y:0};host.replaceChildren();}
 function draw(){const focusedKey=location||region||realm;const focusedItem=(location?data.locations:region?data.regions:data.realms)?.find(item=>item.key===focusedKey);onContextChange?.({...(focusedKey?{section:location?'locations':region?'regions':'realms',key:focusedKey}:{}),label:focusedItem?.name||focusedKey||'World map'});disposeViewport();host.replaceChildren();const heading=node('div',undefined,'map-heading');const title=node('div');title.append(node('h2','World map'),node('p','Drag regions between realm cells and locations within their parent region. North is up.'));const controls=node('div',undefined,'map-controls');const realmSelect=select(data.realms.map(r=>[r.key,r.name]),realm);realmSelect.setAttribute('aria-label','Realm');realmSelect.disabled=!data.realms.length;realmSelect.onchange=act(async()=>{if(!await canNavigate()){realmSelect.value=realm;return;}realm=realmSelect.value;region='';location='';view='realm';const first=data.regions.find(r=>r.realm===realm&&Number.isInteger(r.x)&&Number.isInteger(r.y));center={x:first?.x??0,y:first?.y??0};draw();});const newRealm=input();newRealm.placeholder='New realm name';newRealm.setAttribute('aria-label','New realm name');heading.append(title,labeled('Realm',realmSelect));controls.append(newRealm,button('+ Realm',async()=>{const name=newRealm.value.trim();if(!name)throw new Error('Enter a realm name.');await change('add-realm',{key:name},`Added realm ${name}.`);realm=name;region='';location='';view='realm';center={x:0,y:0};targetCell={x:0,y:0};draw();}));if(region)controls.append(button(view==='realm'?'Open region map':'Realm grid',async()=>{if(!await canNavigate())return;view=view==='realm'?'region':'realm';draw();focusRegion();}));host.append(heading);const settings=node('details',undefined,'map-settings');settings.open=!matchMedia('(width < 761px), (pointer:coarse) and (height < 501px)').matches||!data.realms.length;settings.append(node('summary','Map settings & realm management'),controls,settingsControls());host.append(settings);
  if(data.warnings.length){const warning=node('details',undefined,'map-warnings');warning.append(node('summary',`${data.warnings.length} map issue${data.warnings.length===1?'':'s'} to review`));const list=node('ul');for(const item of data.warnings.slice(0,40))list.append(node('li',item));warning.append(list);host.append(warning);}
  if(!data.realms.length){host.append(node('div',data.regions.length?`Create a realm to place ${data.regions.length} existing region${data.regions.length===1?'':'s'} on the map.`:'Create a realm to place your first region.','blank-state'));return;}
  const layout=node('div',undefined,'map-layout');const stage=node('div',undefined,'map-stage');const sidebar=node('aside',undefined,'map-inspector');if(view==='region'&&region){drawLocal(stage,sidebar);}else{view='realm';drawRealm(stage,sidebar);}layout.append(stage,sidebar);host.append(layout);
 }
 function drawRealm(stage,sidebar){
  const toolbar=node('div',undefined,'map-stage-toolbar'),nav=node('div',undefined,'map-nav');
  toolbar.append(labelToggle());
  const viewport=node('div',undefined,'map-viewport'),grid=node('div',undefined,'map-grid');
  viewport.classList.toggle('feather-edges',data.regionMapBorderFeatheringEnabled!==false);viewport.tabIndex=0;viewport.setAttribute('aria-label','Realm map. Pinch or scroll to zoom, drag empty space to pan, or use arrow keys.');
  grid.setAttribute('role','group');grid.setAttribute('aria-label','Visible region cells');
  let frame=0,disposed=false,lastBounds='',drag=null,pinch=null,suppressClick=false;
  const touches=new Map();
  const placed=new Map();for(const item of data.regions){if(item.realm===realm&&Number.isInteger(item.x)&&Number.isInteger(item.y)&&!placed.has(`${item.x},${item.y}`))placed.set(`${item.x},${item.y}`,item);}
  const camera=()=>({...center,size:cellSize});
  const zoom=input(cellSize,'range');zoom.min=MAP_MIN_CELL;zoom.max=MAP_MAX_CELL;zoom.step='1';zoom.setAttribute('aria-label','Map cell size');
  const zoomValue=node('output');zoomValue.setAttribute('aria-live','off');
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(paint);};
  const move=(dx,dy)=>{center.x+=dx;center.y+=dy;schedule();};
  for(const [label,dx,dy] of [['←',-1,0],['→',1,0],['↑',0,1],['↓',0,-1]])nav.append(button(label,()=>move(dx*3,dy*3)));
  const zoomAt=(requested,point={x:viewport.clientWidth/2,y:viewport.clientHeight/2})=>{
   const next=zoomMapCamera(camera(),requested,point,{width:viewport.clientWidth,height:viewport.clientHeight});
   center={x:next.x,y:next.y};cellSize=next.size;zoom.value=String(cellSize);schedule();
  };
  zoom.oninput=()=>zoomAt(Number(zoom.value));
  const out=button('−',()=>zoomAt(cellSize/1.2));out.setAttribute('aria-label','Zoom out');
  const inside=button('+',()=>zoomAt(cellSize*1.2));inside.setAttribute('aria-label','Zoom in');
  const reset=button('Reset view',()=>{cellSize=132;const selected=data.regions.find(r=>r.key===region&&r.realm===realm&&Number.isInteger(r.x)&&Number.isInteger(r.y));center=selected?{x:selected.x,y:selected.y}:{...targetCell};schedule();});
  const zoomControls=node('div',undefined,'map-zoom-controls');zoomControls.append(out,labeled('Zoom',zoom),inside,zoomValue,reset);
  const jump=select([['','Jump to region'],...data.regions.filter(r=>r.realm===realm&&Number.isInteger(r.x)&&Number.isInteger(r.y)).map(r=>[r.key,r.name||r.key])],'');
  jump.setAttribute('aria-label','Jump to region');jump.onchange=act(async()=>{if(!await canNavigate()){jump.value='';return;}const found=data.regions.find(r=>r.key===jump.value);if(found){center={x:found.x,y:found.y};region=found.key;targetCell={x:found.x,y:found.y};draw();}});
  toolbar.append(nav,zoomControls,jump);stage.append(toolbar);
  function makeCell(x,y){
   const found=placed.get(`${x},${y}`);
   const cell=node('div',undefined,`map-cell${found?' occupied':''}${targetCell.x===x&&targetCell.y===y?' target':''}`);
   cell.dataset.x=x;cell.dataset.y=y;cell.append(node('span',`${x}, ${y}`,'map-coord'));
   cell.ondragover=e=>{e.preventDefault();cell.classList.add('drop-target');};cell.ondragleave=()=>cell.classList.remove('drop-target');
   cell.ondrop=act(async e=>{e.preventDefault();cell.classList.remove('drop-target');const assetId=e.dataTransfer.getData('application/x-voyage-asset');if(assetId){if(!found){status('Drop an image onto an existing region, not an empty cell.',true);return;}if(!await canNavigate())return;await imageUploads.open({target:'REGION_MAP_IMAGE',assetId,onUploaded:upload=>change('set-field',{kind:'region',key:found.key,field:'imageUrl',value:upload.imageUrl},'Image attached to the region in the working copy.')});return;}const key=e.dataTransfer.getData('text/plain');if(key&&key!==found?.key)await change('move-region',{key,x,y},`Moved ${key} to (${x}, ${y}).`);});
   if(found){
    if(safeImage(found.imageUrl)){cell.classList.add('has-map-image');const image=node('img');image.src=found.imageUrl;image.alt='';image.loading='lazy';cell.append(image);}
    const tile=node('button',undefined,'map-region-tile');tile.append(node('span',found.name||found.key,'map-region-name'));tile.setAttribute('aria-label',found.name||found.key);tile.title=found.name||found.key;tile.draggable=true;tile.ondragstart=e=>e.dataTransfer.setData('text/plain',found.key);
    tile.onclick=act(async()=>{if(!await canNavigate())return;region=found.key;location='';targetCell={x,y};targetLocal={x:0,y:0};view='region';draw();focusRegion();});cell.append(tile);
   }else{
    cell.setAttribute('role','button');cell.tabIndex=0;cell.setAttribute('aria-label',`Empty region cell ${x}, ${y}`);
    const choose=act(async()=>{if(!await canNavigate())return;region='';location='';targetCell={x,y};draw();focusInspector();});cell.onclick=choose;
    cell.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
   }
   return cell;
  }
  const scale=node('div',undefined,'map-scale-bar'),scaleLine=node('div',undefined,'map-scale-line'),scaleText=node('span');scaleText.dataset.mapScale='';scaleText.textContent=sizeLabel(data.regionSize)+' units · one region';scale.append(scaleLine,scaleText);
  function paint(){
   frame=0;if(disposed)return;const width=viewport.clientWidth,height=viewport.clientHeight;if(!width||!height)return;
   const minX=Math.floor(center.x-width/2/cellSize)-1,maxX=Math.ceil(center.x+width/2/cellSize)+1;
   const minY=Math.floor(center.y-height/2/cellSize)-1,maxY=Math.ceil(center.y+height/2/cellSize)+1;
   const bounds=[minX,maxX,minY,maxY].join(',');
   if(bounds!==lastBounds){const cells=document.createDocumentFragment();for(let y=maxY;y>=minY;y--)for(let x=minX;x<=maxX;x++)cells.append(makeCell(x,y));grid.replaceChildren(cells);lastBounds=bounds;}
   grid.style.gridTemplateColumns=`repeat(${maxX-minX+1}, ${cellSize}px)`;grid.style.gridAutoRows=`${cellSize}px`;
   grid.style.transform=`translate(${width/2+(minX-center.x-.5)*cellSize}px,${height/2-(maxY-center.y+.5)*cellSize}px)`;
   viewport.dataset.centerX=center.x;viewport.dataset.centerY=center.y;viewport.dataset.cellSize=cellSize;
   zoom.value=String(cellSize);zoomValue.textContent=`${Math.round(cellSize/132*100)}%`;scaleLine.style.width=cellSize+'px';
   out.disabled=cellSize<=MAP_MIN_CELL;inside.disabled=cellSize>=MAP_MAX_CELL;
  }
  viewport.addEventListener('wheel',e=>{e.preventDefault();const box=viewport.getBoundingClientRect();const units=e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1;const delta=clamp(e.deltaY*units,-160,160);zoomAt(cellSize*Math.exp(-delta*.002),{x:e.clientX-box.left-viewport.clientLeft,y:e.clientY-box.top-viewport.clientTop});},{passive:false});
  const touchPair=()=>{const [a,b]=touches.values();return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
  const startPinch=()=>{const pair=touchPair(),box=viewport.getBoundingClientRect();pinch={...pair,camera:camera(),point:{x:pair.x-box.left-viewport.clientLeft,y:pair.y-box.top-viewport.clientTop}};drag=null;suppressClick=true;viewport.classList.add('is-panning');for(const id of touches.keys())viewport.setPointerCapture(id);};
  viewport.onpointerdown=e=>{
   if(e.button!==0&&e.button!==1)return;
   if(e.pointerType==='touch'){
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size>=2){if(touches.size===2)startPinch();e.preventDefault();return;}
   }
   if(e.button===0&&e.target.closest('.map-region-tile'))return;
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,camera:camera(),moved:false};if(e.button===1)e.preventDefault();
  };
  viewport.onpointermove=e=>{
   if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pinch&&touches.size>=2){
    e.preventDefault();const pair=touchPair();
    const scaled=zoomMapCamera(pinch.camera,pinch.camera.size*pair.distance/pinch.distance,pinch.point,{width:viewport.clientWidth,height:viewport.clientHeight});
    const next=panMapCamera(scaled,pair.x-pinch.x,pair.y-pinch.y);center={x:next.x,y:next.y};cellSize=next.size;schedule();return;
   }
   if(!drag||drag.id!==e.pointerId)return;
   if(!e.buttons){drag=null;viewport.classList.remove('is-panning');return;}
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<4)return;
   drag.moved=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-panning');const next=panMapCamera(drag.camera,dx,dy);center={x:next.x,y:next.y};schedule();
  };
  const endDrag=e=>{
   touches.delete(e.pointerId);
   if(pinch){
    if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
    if(touches.size>=2){startPinch();return;}
    pinch=null;const [remaining]=touches;
    drag=remaining?{id:remaining[0],...remaining[1],camera:camera(),moved:true}:null;
    if(drag)return;
   }else{if(!drag||drag.id!==e.pointerId)return;suppressClick=drag.moved;drag=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);}
   viewport.classList.remove('is-panning');setTimeout(()=>{suppressClick=false;},0);
  };
  viewport.onpointerup=endDrag;viewport.onpointercancel=endDrag;
  viewport.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  viewport.onkeydown=e=>{if(e.target!==viewport)return;const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};if(directions[e.key]){e.preventDefault();move(...directions[e.key]);}else if(e.key==='+'||e.key==='='){e.preventDefault();zoomAt(cellSize*1.2);}else if(e.key==='-'){e.preventDefault();zoomAt(cellSize/1.2);}};
  const resize=new ResizeObserver(schedule);resize.observe(viewport);
  disposeViewport=()=>{disposed=true;resize.disconnect();if(frame)cancelAnimationFrame(frame);frame=0;drag=pinch=null;touches.clear();};
  viewport.append(grid,scale);stage.append(viewport,node('p','Pinch or scroll to zoom. Drag empty space (or middle-drag) to pan. Drag an occupied region to move it. Use Reset view to return to your selection.','map-help'));schedule();
  const unplaced=data.regions.filter(isUnplaced);if(unplaced.length){const list=node('div',undefined,'map-unplaced');list.append(node('strong',`Unplaced regions (${unplaced.length})`));for(const item of unplaced)list.append(button(item.name||item.key,async()=>{if(!await canNavigate())return;region=item.key;location='';view='region';draw();focusRegion();}));stage.append(list);}
  if(region){const found=data.regions.find(r=>r.key===region);if(found&&(found.realm===realm||isUnplaced(found))){regionInspector(sidebar,found);return;}}newRegionInspector(sidebar);
 }
 function newRegionInspector(sidebar){sidebar.append(node('h3',`New region · ${targetCell.x}, ${targetCell.y}`));const name=input();name.placeholder='Region name';sidebar.append(labeled('Name',name),button('Add region',async()=>{await change('add-region',{key:name.value,realm,x:targetCell.x,y:targetCell.y},`Added region ${name.value}.`);region=name.value.trim();draw();},'primary'));sidebar.append(node('p','Region coordinates are integer cells. Location coordinates are edited inside a region.','map-help'));}
 function regionInspector(sidebar,item){
  const unplaced=isUnplaced(item);sidebar.append(node('h3',item.name||item.key),node('p',unplaced?'This region is not placed on a realm grid.':`Grid cell (${item.x}, ${item.y}) · ${item.realm}`));
  const realmChoice=select(data.realms.map(r=>[r.key,r.name||r.key]),data.realms.some(r=>r.key===item.realm)?item.realm:realm);
  const x=input(Number.isInteger(item.x)?item.x:targetCell.x,'number'),y=input(Number.isInteger(item.y)?item.y:targetCell.y,'number');x.step=y.step='1';
  sidebar.append(labeled('Realm',realmChoice),labeled('Grid x (east)',x),labeled('Grid y (north)',y),button(unplaced?'Place region':'Update placement',async()=>{const px=coordinate(x,'Region x'),py=coordinate(y,'Region y'),destination=realmChoice.value;await change('place-region',{key:item.key,realm:destination,x:px,y:py},'Region placement updated.');realm=destination;region=item.key;center={x:px,y:py};targetCell={x:px,y:py};draw();}));
  const info=node('textarea');info.value=item.basicInfo||'';sidebar.append(labeled('Geography and atmosphere',info),button('Save description',()=>change('set-field',{kind:'region',key:item.key,field:'basicInfo',value:info.value},'Region description updated.')));
  regionImageAttachments(sidebar,item);
  sidebar.append(button('Open location map',async()=>{if(!await canNavigate())return;view='region';targetLocal={x:0,y:0};draw();focusRegion();},'primary'));
  sidebar.append(button('Delete region',async()=>{if(!await confirm(`Delete region “${item.key}”? Its locations must be moved or removed first.`))return;await change('delete-region',{key:item.key},'Region removed.');region='';draw();},'map-danger'));
 }
 function localPosition(event,map,size){const box=map.getBoundingClientRect();const px=clamp((event.clientX-box.left)/box.width,0,1),py=clamp((event.clientY-box.top)/box.height,0,1);return {x:Math.round((px-.5)*size*10)/10,y:Math.round((.5-py)*size*10)/10};}
 function regionImageAttachments(container,item){
  const section=node('section',undefined,'map-region-attachments');section.setAttribute('aria-label',`Region image attachments for ${item.name||item.key}`);
  section.append(node('h3','Region map image'),node('p',item.imageUrl?'An image is attached to this region. Replace or detach it without deleting the library asset.':'No image attached. Choose a library image or add a new file.','map-help'));
  section.append(button('Choose or add region image…',async()=>{if(!await canNavigate())return;await imageUploads.open({target:'REGION_MAP_IMAGE',onUploaded:upload=>change('set-field',{kind:'region',key:item.key,field:'imageUrl',value:upload.imageUrl},'Image attached to the region in the working copy.')});}));
  if(item.imageUrl)section.append(button('Detach region image',async()=>{if(!await canNavigate())return;if(!await confirm('Detach this region’s map image? The asset stays in the library.'))return;await change('set-field',{kind:'region',key:item.key,field:'imageUrl',value:''},'Region image detached; the library asset is retained.');}));
  const advanced=node('details'),image=input(item.imageUrl||'','url');image.placeholder='https://…';advanced.append(node('summary','Advanced: image URL'),labeled('Region map image URL',image),button('Set map image',()=>change('set-field',{kind:'region',key:item.key,field:'imageUrl',value:image.value.trim()},'Region map image updated.')));section.append(advanced);container.append(section);
 }
 function drawLocal(stage,sidebar){const item=data.regions.find(r=>r.key===region);if(!item){view='realm';draw();return;}const toolbar=node('div',undefined,'map-stage-toolbar');toolbar.append(button('← Realm grid',async()=>{if(!await canNavigate())return;view='realm';draw();focusRegion();}),node('strong',`${item.name||item.key} · ${sizeLabel(data.regionSize)} coordinate units wide`));toolbar.append(labelToggle());stage.append(toolbar);const map=node('div',undefined,'map-local');map.setAttribute('aria-label',`Location map for ${item.name||item.key}`);map.ondragover=event=>{if(event.dataTransfer.types.includes('application/x-voyage-asset'))event.preventDefault();};map.ondrop=act(async event=>{event.preventDefault();const assetId=event.dataTransfer.getData('application/x-voyage-asset');if(!assetId||!await canNavigate())return;await imageUploads.open({target:'REGION_MAP_IMAGE',assetId,onUploaded:upload=>change('set-field',{kind:'region',key:item.key,field:'imageUrl',value:upload.imageUrl},'Image attached to the region in the working copy.')});});let image=null;if(safeImage(item.imageUrl)){image=node('img');image.src=item.imageUrl;image.alt='';image.loading='lazy';map.append(image);}const crossX=node('div',undefined,'map-axis-x'),crossY=node('div',undefined,'map-axis-y');map.append(crossX,crossY);map.onclick=act(async e=>{if(e.target!==map&&e.target!==image)return;if(!await canNavigate())return;targetLocal=localPosition(e,map,data.regionSize);location='';draw();focusInspector();});for(const loc of data.locations.filter(l=>l.region===region&&l.x!==null&&l.y!==null)){const pin=node('button',undefined,`map-pin${location===loc.key?' selected':''}`);pin.type='button';pin.title=`${loc.name||loc.key} (${loc.x}, ${loc.y})`;pin.setAttribute('aria-label',pin.title);pin.style.left=`${50+100*loc.x/data.regionSize}%`;pin.style.top=`${50-100*loc.y/data.regionSize}%`;const diameter=Math.max(1.4,200*(loc.radius||2)/data.regionSize);pin.style.width=`max(18px, ${diameter}%)`;pin.style.height=`max(18px, ${diameter}%)`;pin.append(node('span',loc.name||loc.key));let start=null,moved=false;pin.onpointerdown=e=>{start={x:e.clientX,y:e.clientY};moved=false;pin.setPointerCapture(e.pointerId);e.stopPropagation();};pin.onpointermove=e=>{if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)moved=true;if(moved){const pos=localPosition(e,map,data.regionSize);pin.style.left=`${50+100*pos.x/data.regionSize}%`;pin.style.top=`${50-100*pos.y/data.regionSize}%`;}};pin.onpointerup=act(async e=>{e.stopPropagation();if(!start)return;if(!await canNavigate()){start=null;draw();return;}start=null;if(moved){moved=false;const pos=localPosition(e,map,data.regionSize);await change('move-location',{key:loc.key,...pos},`Moved ${loc.key} to (${pos.x}, ${pos.y}).`);location=loc.key;draw();}else{location=loc.key;draw();}focusInspector();});pin.onclick=act(async event=>{event.stopPropagation();if(event.detail===0&&await canNavigate()){location=loc.key;draw();focusInspector();}});map.append(pin);}const target=node('div','+','map-local-target');target.style.left=`${50+100*targetLocal.x/data.regionSize}%`;target.style.top=`${50-100*targetLocal.y/data.regionSize}%`;if(!location)map.append(target);stage.append(map,node('p',`Click the map to set a new location position. Drag a marker to move it. Local coordinates run from −${data.regionSize/2} to +${data.regionSize/2}; north is +y.`,'map-help'));
  const unplaced=data.locations.filter(l=>l.region===region&&(l.x===null||l.y===null));if(unplaced.length){const list=node('div',undefined,'map-unplaced');list.append(node('strong',`Unplaced locations (${unplaced.length})`));for(const item of unplaced)list.append(button(item.name||item.key,async()=>{if(!await canNavigate())return;location=item.key;draw();focusInspector();}));stage.append(list);}
  regionImageAttachments(stage,item);
  const loc=data.locations.find(l=>l.key===location&&l.region===region);if(loc)locationInspector(sidebar,loc);else newLocationInspector(sidebar);
 }
 function newLocationInspector(sidebar){sidebar.append(node('h3',`New location · ${targetLocal.x}, ${targetLocal.y}`));const name=input();name.placeholder='Location name';sidebar.append(labeled('Name',name),button('Add location',async()=>{const key=name.value.trim();await change('add-location',{key,region,...targetLocal},`Added location ${key}.`);location=key;draw();},'primary'));sidebar.append(node('p','New locations start as simple, basic places with radius 2. Edit their details after placing them.','map-help'));}
 function locationInspector(sidebar,loc){sidebar.append(node('h3',loc.name||loc.key),node('p',loc.x===null||loc.y===null?'Set this location’s position to place its marker.':`Local position (${loc.x}, ${loc.y})`));const x=input(loc.x??targetLocal.x,'number'),y=input(loc.y??targetLocal.y,'number');x.step=y.step='0.1';sidebar.append(labeled('Local x (east)',x),labeled('Local y (north)',y),button('Set position',()=>change('move-location',{key:loc.key,x:coordinate(x,'Location x'),y:coordinate(y,'Location y')},'Location position updated.')));const parent=select(data.regions.map(r=>[r.key,r.name||r.key]),loc.region);parent.onchange=act(()=>change('set-field',{kind:'location',key:loc.key,field:'region',value:parent.value},'Location moved to another region.'));sidebar.append(labeled('Parent region',parent));const info=node('textarea');info.value=loc.basicInfo||'';sidebar.append(labeled('Place description',info),button('Save description',()=>change('set-field',{kind:'location',key:loc.key,field:'basicInfo',value:info.value},'Location description updated.')));const radius=input(loc.radius??2,'number');radius.min='0.1';radius.step='0.1';radius.onchange=act(()=>change('set-field',{kind:'location',key:loc.key,field:'radius',value:coordinate(radius,'Radius')},'Location radius updated.'));sidebar.append(labeled('Radius (coordinate units)',radius));for(const [field,label,options] of [['complexityType','Complexity',['simple','complex','wilderness']],['detailType','Detail',['basic','detailed']]]){const choice=select(options.map(v=>[v,v]),loc[field]||options[0]);choice.onchange=act(()=>change('set-field',{kind:'location',key:loc.key,field,value:choice.value},`${label} updated.`));sidebar.append(labeled(label,choice));}sidebar.append(button('Delete location',async()=>{if(!await confirm(`Delete location “${loc.key}”? This removes its authored record.`))return;await change('delete-location',{key:loc.key},'Location removed.');location='';draw();},'map-danger'));}
 return {render:refresh,projectChanged,canNavigate,destroy:()=>{host.removeEventListener('input',draftInput);destroyed=true;disposeViewport();}};
}
