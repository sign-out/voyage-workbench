import {mapInspect} from './features';

export interface MapFeature {
 id:string;kind:'land'|'water'|'forest'|'mountain'|'road'|'river'|'settlement'|'landmark';
 points:number[][];label?:string;locationKey?:string;locked?:boolean;
}
export interface CreationMap {
 id:string;realm:string;west:number;north:number;columns:number;rows:number;
 background:string;land:string;water:string;forest:string;ink:string;features:MapFeature[];style?:'atlas'|'schematic';
}
export const creationMapRendererVersion='cartography-v2';
const colors=['background','land','water','forest','ink'] as const;
export function validateCreationMaps(input:unknown):CreationMap[] {
 if(!Array.isArray(input)||input.length>8)throw new Error('Provide at most eight map blueprints.');
 const ids:string[]=[];
 for(const map of input){
  if(!map||typeof map!=='object'||Object.keys(map).some(key=>!['id','realm','west','north','columns','rows',...colors,'features','style'].includes(key)))throw new Error('Invalid map blueprint fields.');
  if(map.style!==undefined&&!['atlas','schematic'].includes(map.style))throw new Error('Choose atlas or schematic map styling.');
  if(typeof map.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(map.id)||ids.includes(map.id)||typeof map.realm!=='string'||!map.realm.trim()||map.realm.length>200)throw new Error('Maps need unique IDs and a realm key.');
  ids.push(map.id);
  if(!Number.isSafeInteger(map.west)||!Number.isSafeInteger(map.north)||Math.abs(map.west)>1000000||Math.abs(map.north)>1000000||![map.columns,map.rows].every(value=>Number.isInteger(value)&&value>=1&&value<=8))throw new Error('Map grids must be 1–8 cells per side with bounded integer anchors.');
  if(colors.some(key=>typeof map[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(map[key])))throw new Error('Map palette values must be six-digit hexadecimal colors.');
  if(!Array.isArray(map.features)||map.features.length>1000)throw new Error('A map supports at most 1,000 features.');
  const featureIds:string[]=[];
  for(const feature of map.features){
   if(!feature||Object.keys(feature).some(key=>!['id','kind','points','label','locationKey','locked'].includes(key))||typeof feature.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(feature.id)||featureIds.includes(feature.id))throw new Error('Map features need unique IDs and supported fields.');
   featureIds.push(feature.id);
   if(!['land','water','forest','mountain','road','river','settlement','landmark'].includes(feature.kind))throw new Error('Unsupported map feature kind.');
   const minimum=['settlement','landmark','mountain'].includes(feature.kind)?1:['road','river'].includes(feature.kind)?2:3;
   if(!Array.isArray(feature.points)||feature.points.length<minimum||feature.points.length>200||feature.points.some((point:any)=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<0||point[0]>map.columns||point[1]<0||point[1]>map.rows))throw new Error('Map points must fit the global cell-coordinate blueprint.');
   for(const key of ['label','locationKey'])if(feature[key]!==undefined&&(typeof feature[key]!=='string'||feature[key].length>200))throw new Error('Invalid map feature text.');
   if(feature.locked!==undefined&&typeof feature.locked!=='boolean')throw new Error('Map locks must be booleans.');
  }
 }
 return JSON.parse(JSON.stringify(input));
}
export function mapBlueprintIssues(source:string,maps:CreationMap[]){
 const world=mapInspect(source),issues:string[]=[],mapped=new Set<string>();
 for(const map of maps){
  if(!world.realms.some((realm:any)=>realm.key===map.realm))issues.push(`Map ${map.id}: unknown realm ${map.realm}.`);
  for(const region of world.regions.filter((region:any)=>region.realm===map.realm)){
   const column=region.x-map.west,row=map.north-region.y;
   if(Number.isInteger(column)&&Number.isInteger(row)&&column>=0&&column<map.columns&&row>=0&&row<map.rows){if(mapped.has(region.key))issues.push(`Region ${region.key} appears in overlapping blueprints.`);mapped.add(region.key);}
  }
  for(const feature of map.features.filter(feature=>feature.locationKey)){
   const location=world.locations.find((location:any)=>location.key===feature.locationKey),region=world.regions.find((region:any)=>region.key===location?.region);
   if(!location||!region||region.realm!==map.realm){issues.push(`Feature ${feature.id}: location does not belong to this map.`);continue;}
   const expected=[region.x-map.west+.5+location.x/world.regionSize,map.north-region.y+.5-location.y/world.regionSize];
   if(expected.some(value=>!Number.isFinite(value))||Math.abs(feature.points[0][0]-expected[0])>.02||Math.abs(feature.points[0][1]-expected[1])>.02)issues.push(`Feature ${feature.id}: placement disagrees with location ${location.key}.`);
  }
 }
 for(const region of world.regions)if(!mapped.has(region.key))issues.push(`Region ${region.key} has no map blueprint.`);
 for(const location of world.locations)if(!maps.some(map=>map.features.some(feature=>feature.locationKey===location.key)))issues.push(`Location ${location.key} has no map feature.`);
 return [...world.warnings,...issues];
}
export function mapRegion(source:string,maps:CreationMap[],regionKey:string,world=mapInspect(source)){
 const region=world.regions.find((region:any)=>region.key===regionKey);
 if(!region)throw new Error('Map region does not exist.');
 const matches=maps.filter(map=>map.realm===region.realm&&region.x>=map.west&&region.x<map.west+map.columns&&region.y<=map.north&&region.y>map.north-map.rows);
 if(matches.length!==1)throw new Error('Each region must have exactly one containing blueprint.');
 return {map:matches[0],column:region.x-matches[0].west,row:matches[0].north-region.y};
}
function escapeXml(text:string){return text.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]!));}
export function creationMapSvg(map:CreationMap,view={column:0,row:0,columns:map.columns,rows:map.rows},labels=false){
 validateCreationMaps([map]);
 if(![view.column,view.row,view.columns,view.rows].every(Number.isFinite)||view.columns<=0||view.rows<=0||view.column<0||view.row<0||view.column+view.columns>map.columns||view.row+view.rows>map.rows)throw new Error('Invalid map viewport.');
 const atlas=map.style!=='schematic',patternPrefix='creation:'+map.id+':';
 const definitions=atlas?`<defs><pattern id="${patternPrefix}paper" width=".08" height=".08" patternUnits="userSpaceOnUse"><path d="M.005 .015h.018M.043 .06h.012" stroke="${map.ink}" stroke-opacity=".07" stroke-width=".0015"/></pattern><pattern id="${patternPrefix}waves" width=".12" height=".09" patternUnits="userSpaceOnUse"><path d="M.01 .04q.025-.018 .05 0t.05 0" fill="none" stroke="${map.background}" stroke-opacity=".3" stroke-width=".003"/></pattern><pattern id="${patternPrefix}trees" width=".085" height=".09" patternUnits="userSpaceOnUse"><path d="M.043 .015l-.022 .042h.044z" fill="${map.forest}" stroke="${map.ink}" stroke-opacity=".4" stroke-width=".002"/><path d="M.043 .057v.014" stroke="${map.ink}" stroke-width=".003"/></pattern></defs>`:'';
 const shapes=map.features.map(feature=>{
  const points=feature.points.map(point=>point.join(',')).join(' '),[horizontal,vertical]=feature.points[0];let shape='';
  if(['land','water','forest'].includes(feature.kind)){
   const fill=feature.kind==='land'?map.land:feature.kind==='water'?map.water:map.forest;
   shape=(atlas&&feature.kind==='land'?`<polygon points="${points}" fill="none" stroke="${map.ink}" stroke-opacity=".16" stroke-width=".022" stroke-linejoin="round"/>`:'')+`<polygon points="${points}" fill="${fill}" stroke="${map.ink}" stroke-width="0.004"/>`;
   if(atlas)shape+=`<polygon points="${points}" fill="url(#${patternPrefix}${feature.kind==='water'?'waves':feature.kind==='forest'?'trees':'paper'})"/>`;
  }
  else if(['road','river'].includes(feature.kind)){
   const river=feature.kind==='river';
   shape=(atlas?`<polyline points="${points}" fill="none" stroke="${river?map.ink:map.background}" stroke-opacity="${river?'.24':'.8'}" stroke-width="${river?'.032':'.025'}" stroke-linecap="round" stroke-linejoin="round"/>`:'')+`<polyline points="${points}" fill="none" stroke="${river?map.water:map.ink}" stroke-width="${river?'.025':'.012'}" stroke-linecap="round" stroke-linejoin="round"${atlas&&!river?' stroke-dasharray=".018 .013"':''}/>`;
   if(atlas&&river)shape+=`<polyline points="${points}" fill="none" stroke="${map.background}" stroke-opacity=".3" stroke-width=".004" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  else if(feature.kind==='mountain')shape=feature.points.map(([horizontal,vertical])=>`<path d="M${horizontal-.05},${vertical+.04} L${horizontal},${vertical-.06} L${horizontal+.05},${vertical+.04} Z" fill="${map.background}" stroke="${map.ink}" stroke-width=".006"/>${atlas?`<path d="M${horizontal},${vertical-.06} L${horizontal+.012},${vertical+.035} L${horizontal+.05},${vertical+.04} Z" fill="${map.ink}" fill-opacity=".23"/><path d="M${horizontal-.015},${vertical-.03}l.015-.03 .015 .03-.015-.008z" fill="${map.background}"/>`:''}`).join('');
  else if(feature.kind==='settlement')shape=(atlas?`<circle cx="${horizontal}" cy="${vertical}" r=".047" fill="${map.background}" fill-opacity=".85" stroke="${map.ink}" stroke-width=".002"/>`:'')+`<path d="M${horizontal-.025},${vertical+.025} V${vertical-.012} L${horizontal},${vertical-.04} L${horizontal+.025},${vertical-.012} V${vertical+.025} Z" fill="${map.background}" stroke="${map.ink}" stroke-width=".006"/>${atlas?`<path d="M${horizontal-.028},${vertical-.01}l.028-.033 .028 .033M${horizontal-.006},${vertical+.025}v-.02h.012v.02" fill="none" stroke="${map.ink}" stroke-width=".004"/>`:''}`;
  else shape=`<circle cx="${horizontal}" cy="${vertical}" r=".025" fill="${map.ink}"/>`;
  return `<g id="${escapeXml(feature.id)}">${shape}${labels&&feature.label?`<text x="${horizontal+.04}" y="${vertical}" font-size=".055" fill="${map.ink}">${escapeXml(feature.label)}</text>`:''}</g>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${view.columns*1000}" height="${view.rows*1000}" viewBox="${view.column} ${view.row} ${view.columns} ${view.rows}">${definitions}<rect x="0" y="0" width="${map.columns}" height="${map.rows}" fill="${map.background}"/>${shapes}</svg>`;
}
