export const COVERAGE_METRICS = [
 {id:'locations',label:'Locations',unit:'locations'},
 {id:'npcs',label:'NPCs',unit:'NPCs'},
 {id:'factions',label:'Faction presence',unit:'factions'},
 {id:'quests',label:'Quests',unit:'quests'},
 {id:'storyStarts',label:'Story starts',unit:'story starts'},
 {id:'words',label:'Authored lore / detail',unit:'words'},
 {id:'areas',label:'Location areas',unit:'areas'},
 {id:'other',label:'Items / creatures / events',unit:'records'},
 {id:'connections',label:'Spatial connections',unit:'links'},
 {id:'unfinished',label:'Missing descriptions',unit:'records'},
];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const entries=value=>object(value)?Object.entries(value):[];
const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.filter(item=>typeof item==='string'):[];
const identity=(section,key)=>JSON.stringify([section,key]);
const words=value=>typeof value==='string'?(value.trim().match(/\S+/gu)||[]).length:0;
const prose=['basicInfo','hiddenInfo','description','text','history','secrets','personality','visualDescription','questStatement','mainObjective','questDesignBrief','completionCondition','nextStep','storyStart','beats'];
const descriptions={regions:['basicInfo'],locations:['basicInfo'],npcs:['basicInfo'],factions:['basicInfo'],quests:['questStatement','mainObjective','questDesignBrief'],storyStarts:['description','storyStart']};
const emptyCounts=()=>Object.fromEntries(COVERAGE_METRICS.map(metric=>[metric.id,0]));
const bucket=()=>({counts:emptyCounts(),records:[],links:new Set()});

export function analyzeMapCoverage(state, map) {
 const regions=new Map(map.regions.map(item=>[item.key,item]));
 const locations=new Map(map.locations.map(item=>[item.key,item]));
 const realms=new Set(map.realms.map(item=>item.key));
 const regionBuckets=new Map([...regions.keys()].map(key=>[key,bucket()]));
 const locationBuckets=new Map([...locations.keys()].map(key=>[key,bucket()]));
 const records=new Map(),issues=[];
 const placedRegion=key=>{const place=regions.get(key);return !!place&&realms.has(place.realm)&&Number.isSafeInteger(place.x)&&Number.isSafeInteger(place.y);};
 const placedLocation=key=>{const place=locations.get(key);return !!place&&placedRegion(place.region)&&Number.isFinite(place.x)&&Number.isFinite(place.y)&&Math.abs(place.x)<=map.regionSize/2&&Math.abs(place.y)<=map.regionSize/2;};
 function add(section,key,value,metric){
  const fields=descriptions[section];
  const record={id:identity(section,key),section,key,label:typeof value.name==='string'?value.name:key,metric,
   words:prose.reduce((total,field)=>total+words(value[field]),0),
   unfinished:!!fields&&!fields.some(field=>typeof value[field]==='string'&&value[field].trim()),
   regions:new Set(),locations:new Set(),links:new Map()};
  records.set(record.id,record);return record;
 }
 function link(record,kind,key){
  if(!key)return;
  const target=kind==='locations'?locations:regions;
  if(!target.has(key)){issues.push({record:record.id,label:`${record.section} / ${record.label}: unknown ${kind==='locations'?'location':'region'} “${key}”.`});return;}
  const linkId=identity(kind,key);record.links.set(linkId,{kind,key});
  if(kind==='locations'){
   record.locations.add(key);const parent=locations.get(key).region;
   if(regions.has(parent))record.regions.add(parent);
  }else record.regions.add(key);
 }
 function spatial(record,value,fields){
  for(const [field,kind] of fields)for(const key of new Set(strings(value[field])))link(record,kind,key);
 }
 for(const [key,value] of entries(state.regions))if(object(value)&&regions.has(key)){
  const record=add('regions',key,value,null);record.regions.add(key);
 }
 for(const [key,value] of entries(state.locations))if(object(value)&&locations.has(key)){
  const record=add('locations',key,value,'locations');record.locations.add(key);
  if(typeof value.region==='string')link(record,'regions',value.region);
  for(const [area,detail] of entries(value.areas))if(object(detail)){
   const child=add('areas',identity(key,area),detail,'areas');child.label=`${key} / ${area}`;
   link(child,'locations',key);
  }
 }
 const generic=[['location','locations'],['locations','locations'],['region','regions'],['regions','regions']];
 const sections=[['npcs','npcs',[['currentLocation','locations']]],['factions','factions',generic],
  ['quests','quests',[['questLocation','locations']]],['storyStarts','storyStarts',[['locations','locations']]],
  ['worldLore',null,generic],['lore',null,generic],
  ...['items','itemTypes','resources','creatures','encounters','events','narrativeEvents'].map(section=>[section,'other',generic])];
 for(const [section,metric,fields] of sections)for(const [key,raw] of entries(state[section])){
  const value=typeof raw==='string'&&(section==='worldLore'||section==='lore')?{text:raw}:raw;
  if(!object(value))continue;
  const record=add(section,key,value,metric);spatial(record,value,fields);
 }
 function factionLink(key,kind,place,source){
  const faction=records.get(identity('factions',key));
  if(faction)link(faction,kind,place);
  else if(key)issues.push({record:source,label:`${source}: unknown faction “${key}”.`});
 }
 for(const section of ['regions','locations'])for(const [key,value] of entries(state[section]))if(object(value)){
  for(const faction of new Set(strings(value.factions)))factionLink(faction,section,key,`${section} / ${key}`);
 }
 for(const [key,value] of entries(state.npcs))if(object(value)&&typeof value.faction==='string'){
  const record=records.get(identity('npcs',key));
  if(record)for(const location of record.locations)factionLink(value.faction,'locations',location,`npcs / ${key}`);
 }
 for(const record of records.values()){
  for(const [kind,keys,buckets] of [['regions',record.regions,regionBuckets],['locations',record.locations,locationBuckets]])for(const key of keys){
   const target=buckets.get(key);if(!target)continue;
   target.records.push(record.id);
   if(record.metric)target.counts[record.metric]++;
   target.counts.words+=record.words;target.counts.unfinished+=Number(record.unfinished);
   for(const [linkId,place] of record.links){
    const applies=kind==='regions'?(place.kind==='regions'?place.key===key:locations.get(place.key)?.region===key):place.kind==='locations'&&place.key===key;
    if(applies)target.links.add(identity(record.id,linkId));
   }
  }
 }
 for(const target of [...regionBuckets.values(),...locationBuckets.values()])target.counts.connections=target.links.size;
 const unmapped=[],regionOnly=[];
 for(const record of records.values()){
  if(![...record.regions].some(placedRegion))unmapped.push(record.id);
  else if(![...record.locations].some(placedLocation))regionOnly.push(record.id);
 }
 const available=COVERAGE_METRICS.filter(metric=>[...records.values()].some(record=>metric.id===record.metric||metric.id==='words'&&record.words>0||metric.id==='unfinished'&&record.unfinished||metric.id==='connections'&&record.links.size>0));
 return {regions:regionBuckets,locations:locationBuckets,records,issues,unmapped,regionOnly,available,placedRegion,placedLocation};
}

export function coverageScale(buckets, layer, weights, metrics=COVERAGE_METRICS) {
 const maxima=emptyCounts();
 for(const target of buckets)for(const metric of metrics)maxima[metric.id]=Math.max(maxima[metric.id],target.counts[metric.id]||0);
 const weight=key=>Number.isFinite(weights[key])?Math.max(0,Math.min(5,weights[key])):1;
 const total=metrics.reduce((sum,metric)=>sum+(maxima[metric.id]>0?weight(metric.id):0),0);
 const value=target=>layer==='combined'?(total?metrics.reduce((sum,metric)=>sum+(maxima[metric.id]?target.counts[metric.id]/maxima[metric.id]*weight(metric.id):0),0)/total:0):(target.counts[layer]||0);
 const max=layer==='combined'?1:(maxima[layer]||0);
 return {value,max,intensity:target=>max?Math.max(0,Math.min(1,value(target)/max)):0};
}
