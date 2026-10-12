import {mapInspect,mapEdit} from './features';
import {mediaUrl} from './studio';
import {parse,at,statePath} from './document';

export interface RegionTile {column:number;row:number;x:number;y:number;regionKey?:string;regionName?:string;createRegion?:boolean}
export interface RegionTileAssignment {regionKey:string;url:string;createRegion?:boolean;realm?:string;x?:number;y?:number}
function validateGrid(columns:number,rows:number){
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>16||rows>16)throw new Error('Choose a grid of 1–16 columns and 1–16 rows.');
}
export function validateMasterSize(width:number,height:number,columns:number,rows:number){
 validateGrid(columns,rows);
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<columns*600||height<rows*600)throw new Error(`This ${width} × ${height} master is too small for ${columns} × ${rows} tiles. Use at least ${columns*600} × ${rows*600} pixels so every tile is at least 600 × 600. Images are not upscaled.`);
}
export function regionTilePlan(source:string,realm:string,west:number,north:number,columns:number,rows:number,options:{createMissing?:boolean}={}):RegionTile[]{
 validateGrid(columns,rows);
 if(!Number.isSafeInteger(west)||!Number.isSafeInteger(north)||!Number.isSafeInteger(west+(columns-1))||!Number.isSafeInteger(north-(rows-1)))throw new Error('Grid anchors must be safe integer coordinates.');
 const map=mapInspect(source);
 if(!map.realms.some((item:{key:string})=>item.key===realm))throw new Error('Choose an existing realm.');
 const root=parse(source),state=at(root,statePath(root)),regions=state.children.find(child=>child.key==='regions')?.node;
 const tiles:RegionTile[]=[],used=new Set<string>(regions?.children.map(child=>String(child.key))||[]);
 for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const x=west+column,y=north-row,matches=map.regions.filter((region:{realm:string;x:number;y:number})=>region.realm===realm&&region.x===x&&region.y===y);
  if(matches.length>1)throw new Error(`Multiple regions occupy (${x}, ${y}). Resolve the overlap before assigning tiles.`);
  if(matches.length){tiles.push({column,row,x,y,regionKey:matches[0].key,regionName:matches[0].name});continue;}
  if(!options.createMissing){tiles.push({column,row,x,y});continue;}
  const prefix=`${realm.slice(0,60)} · Region (${x}, ${y})`;let regionKey=prefix,suffix=2;
  while(used.has(regionKey))regionKey=`${prefix} · ${suffix++}`;
  used.add(regionKey);tiles.push({column,row,x,y,regionKey,regionName:regionKey,createRegion:true});
 }
 return tiles;
}
export function assignRegionTiles(source:string,tiles:RegionTileAssignment[]){
 const seen=new Set<string>();let result=source;
 for(const tile of tiles){if(seen.has(tile.regionKey))throw new Error('A region cannot receive two tiles in one assignment.');seen.add(tile.regionKey);mediaUrl(tile.url);if(tile.createRegion)result=mapEdit(result,'add-region',{key:tile.regionKey,realm:tile.realm,x:tile.x,y:tile.y});result=mapEdit(result,'set-field',{kind:'region',key:tile.regionKey,field:'imageUrl',value:tile.url});}
 return result;
}
