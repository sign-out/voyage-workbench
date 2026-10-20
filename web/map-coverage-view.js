import {analyzeMapCoverage,coverageScale,COVERAGE_METRICS} from './map-coverage.js';

export function initMapCoverage({node,host}) {
 let analysis=null,map=null,scope={view:'realm',realm:'',region:'',location:''};
 const defaultWeights=()=>Object.fromEntries(COVERAGE_METRICS.map(metric=>[metric.id,metric.id==='unfinished'?0:1]));
 let layer='off',opacity=55,weights=defaultWeights(),cachedScale=null;
 let regionIndex=new Map(),locationIndex=new Map();
 let legend=null,report=null,weightControls=null;
 const metricName=key=>COVERAGE_METRICS.find(metric=>metric.id===key)?.label||key;
 function refresh(source,data){
  const root=JSON.parse(source);
  const state=(data.statePath||[]).reduce((value,key)=>value?.[key],root);
  map=data;regionIndex=new Map(data.regions.map(place=>[place.key,place]));locationIndex=new Map(data.locations.map(place=>[place.key,place]));analysis=analyzeMapCoverage(state||{},data);cachedScale=null;
  if(layer!=='off'&&layer!=='combined'&&!analysis.available.some(metric=>metric.id===layer))layer='off';
 }
 function scale(){
  if(cachedScale)return cachedScale;
  const buckets=scope.view==='region'?[...analysis.locations].filter(([key])=>analysis.placedLocation(key)&&locationIndex.get(key)?.region===scope.region).map(([,value])=>value):
   [...analysis.regions].filter(([key])=>analysis.placedRegion(key)&&regionIndex.get(key)?.realm===scope.realm).map(([,value])=>value);
  cachedScale=coverageScale(buckets,layer,weights,analysis.available);return cachedScale;
 }
 function color(intensity){return `hsl(${Math.round(190-175*intensity)} 90% 55%)`;}
 function heat(target,intensity,local=false){
  const overlay=node('span',undefined,`map-coverage-heat${local?' map-coverage-hotspot':''}`);
  overlay.setAttribute('aria-hidden','true');overlay.style.background=local?`radial-gradient(circle, ${color(intensity)} 0%, ${color(intensity)} 15%, transparent 70%)`:color(intensity);
  overlay.style.opacity=String(opacity/100*(.3+.7*intensity));target.append(overlay);return overlay;
 }
 function decorateRegion(cell,key){
  cell.dataset.coverageKey=key;
  if(!analysis||layer==='off'||!analysis.placedRegion(key))return;
  const target=analysis.regions.get(key),current=scale(),intensity=current.intensity(target);
  if(intensity>0)heat(cell,intensity);
  const tile=cell.querySelector('.map-region-tile');
  if(tile)tile.title=`${regionIndex.get(key)?.name||key} · ${metricName(layer)}: ${format(current.value(target))}`;
 }
 const format=value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
 function recordList(title,ids,container){
  const details=node('details',undefined,'map-coverage-records');details.append(node('summary',`${title} (${ids.length})`));
  const list=node('ul');
  for(const id of ids.slice(0,100)){const record=analysis.records.get(id);list.append(node('li',`${record.section} / ${record.label}`));}
  details.append(list);if(ids.length>100)details.append(node('p','Showing the first 100 records.','map-help'));container.append(details);
 }
 function renderReport(){
  if(!report||!analysis)return;
  report.replaceChildren();report.hidden=layer==='off';if(layer==='off')return;
  report.append(node('summary','Coverage breakdown & unmapped content'));
  const key=scope.location||scope.region;
  const target=(scope.location?analysis.locations:analysis.regions).get(key);
  if(target){
   report.append(node('h3',`Content breakdown · ${key}`));
   const counts=node('div',undefined,'map-coverage-counts');
   for(const metric of analysis.available)counts.append(node('span',`${metric.label}: ${format(target.counts[metric.id])}`));
   report.append(counts);
   const ids=target.records.filter(id=>{
    const record=analysis.records.get(id),linked=[...record.links.keys()].some(link=>target.links.has(JSON.stringify([id,link])));
    if(layer==='combined')return record.metric&&weights[record.metric]>0||weights.words>0&&record.words>0||weights.unfinished>0&&record.unfinished||weights.connections>0&&linked;
    return layer===record.metric||layer==='words'&&record.words>0||layer==='unfinished'&&record.unfinished||layer==='connections'&&linked;
   });
   recordList('Contributing records',ids,report);
  }else report.append(node('p','Open a region or select a location for its counts and contributing records.','map-help'));
  recordList('Unmapped content · entire world',analysis.unmapped,report);
  recordList('Region-only content · entire world',analysis.regionOnly,report);
  const issues=node('details',undefined,'map-coverage-records');issues.append(node('summary',`Broken spatial links · entire world (${analysis.issues.length})`));
  const list=node('ul');for(const issue of analysis.issues.slice(0,100))list.append(node('li',issue.label));issues.append(list);
  if(analysis.issues.length>100)issues.append(node('p','Showing the first 100 broken links.','map-help'));
  report.append(issues);
 }
 function paint(){
  if(!analysis)return;
  cachedScale=null;host.querySelectorAll('.map-coverage-heat').forEach(element=>element.remove());
  for(const cell of host.querySelectorAll('[data-coverage-key]')){
   const tile=cell.querySelector('.map-region-tile');if(tile)tile.title=regionIndex.get(cell.dataset.coverageKey)?.name||cell.dataset.coverageKey;
   decorateRegion(cell,cell.dataset.coverageKey);
  }
  const current=scale(),local=host.querySelector('.map-local');
  if(local&&layer!=='off')for(const place of map.locations){
   if(place.region!==scope.region||!analysis.placedLocation(place.key))continue;
   const target=analysis.locations.get(place.key),intensity=current.intensity(target);
   if(!intensity)continue;
   const overlay=heat(local,intensity,true);overlay.style.left=`${50+100*place.x/map.regionSize}%`;overlay.style.top=`${50-100*place.y/map.regionSize}%`;
  }
  if(legend){legend.hidden=layer==='off';legend.textContent=layer==='combined'?'Combined: 0–1 weighted relative score. Each enabled metric is normalized within this view.':`${metricName(layer)}: 0–${format(current.max)} ${analysis.available.find(metric=>metric.id===layer)?.unit||''} in this ${scope.view==='region'?'region’s placed locations':'realm’s placed regions'}.`;
   if(layer!=='off'&&current.max===0)legend.append(node('span',' No mapped content for this layer in the current view.'));
  }
  if(weightControls)weightControls.hidden=layer!=='combined';
  renderReport();
 }
 function controls(){
  const panel=node('section',undefined,'map-coverage');panel.setAttribute('aria-label','Map content coverage');
  const row=node('div',undefined,'map-coverage-controls');
  const label=node('label','Content coverage'),choice=node('select');choice.setAttribute('aria-label','Content coverage layer');
  for(const [value,text] of [['off','Off'],['combined','Combined density'],...analysis.available.map(metric=>[metric.id,metric.label])]){const option=node('option',text);option.value=value;choice.append(option);}
  choice.value=layer;choice.onchange=()=>{layer=choice.value;paint();};label.append(choice);
  const opacityLabel=node('label','Overlay opacity'),slider=node('input'),output=node('output',`${opacity}%`);
  slider.type='range';slider.min='0';slider.max='100';slider.value=String(opacity);slider.setAttribute('aria-label','Coverage opacity');
  slider.oninput=()=>{opacity=Number(slider.value);output.textContent=`${opacity}%`;paint();};opacityLabel.append(slider,output);row.append(label,opacityLabel);panel.append(row);
  legend=node('p',undefined,'map-coverage-legend');legend.setAttribute('aria-live','polite');panel.append(legend);
  const note=node('p','Transparent = zero · cyan → amber → red = increasing concentration. Empty wilderness may be intentional. Explicit place links determine coverage; region-only content has no local hotspot.','map-help');panel.append(note);
  weightControls=node('details',undefined,'map-coverage-weights');weightControls.append(node('summary','Combined weights (0 excludes a metric)'));
  const fields=node('div',undefined,'map-coverage-weight-fields');
  for(const metric of analysis.available){const label=node('label',metric.label),control=node('input');control.type='number';control.min='0';control.max='5';control.step='0.5';control.value=String(weights[metric.id]);control.setAttribute('aria-label',`${metric.label} weight`);control.oninput=()=>{if(!control.value.trim()||!control.checkValidity())return;weights[metric.id]=Number(control.value);paint();};label.append(control);fields.append(label);}
  weightControls.append(fields);panel.append(weightControls);
  report=node('details',undefined,'map-coverage-report');panel.append(report);return panel;
 }
 function reset(){analysis=null;map=null;legend=report=weightControls=null;layer='off';opacity=55;weights=defaultWeights();cachedScale=null;regionIndex.clear();locationIndex.clear();}
 return {refresh,controls,paint,decorateRegion,reset,setScope:value=>{scope=value;cachedScale=null;}};
}
