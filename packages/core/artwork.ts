import * as doc from './document';
import {assetSlots,assignAsset,mediaUrl} from './studio';
import {put} from './features';

export const imageTargets={
 WORLD_COVER:{label:'World cover',width:1000,height:1000},
 NPC_PORTRAIT:{label:'Character portrait',width:750,height:1000},
 REGION_MAP_IMAGE:{label:'Region map',width:1000,height:1000},
 LOCATION_IMAGE:{label:'Location scene',width:750,height:1333},
 AREA_IMAGE:{label:'Area scene',width:750,height:1333},
 ITEM_IMAGE:{label:'Item image',width:1000,height:1000}
} as const;
export type ImageTarget=keyof typeof imageTargets;
export type ArtworkDestination={id:string;path:doc.Path|null;label:string;category:string;target?:ImageTarget;url:string;context:string};
export function artworkDestinations(source:string,creationDetails='{}'):ArtworkDestination[]{
 const root=doc.parse(source),base=doc.statePath(root);
 const result:ArtworkDestination[]=assetSlots(source).filter(slot=>slot.kind==='image').map(slot=>{
  const relative=slot.path.slice(base.length),section=String(relative[0]),target=slot.target as ImageTarget|undefined;
  const cover=!!base.length&&JSON.stringify(slot.path)===JSON.stringify(base.slice(0,-1).concat('image'));
  const area=section==='locations'&&relative[2]==='areas';
  const category=cover?'World cover':section==='npcs'?'NPC portraits':section==='premadeCharacters'?'Playable characters':section==='regions'?'Region maps':section==='locations'?(area?'Area scenes':'Location scenes'):section==='itemTypes'?'Item images':'Other artwork';
  const entryPath=cover?base.slice(0,-1):area?base.concat(relative.slice(0,4)):base.concat(relative.slice(0,2));
  let entry:doc.Node|undefined;try{entry=doc.at(root,entryPath);}catch{}
  const name=entry?.children.find(child=>child.key==='name')?.node.value||entry?.children.find(child=>child.key==='title')?.node.value||entryPath[entryPath.length-1]||'World';
  const context=(entry?.children||[]).filter(child=>['name','title','description','visualDescription','basicInfo','generatedAppearance'].includes(String(child.key))&&child.node.kind==='string').map(child=>String(child.key)+': '+String(child.node.value).slice(0,2000)).join('\n').slice(0,6000);
  return {id:JSON.stringify(slot.path),path:slot.path,label:cover?'World cover':String(name)+(category==='Area scenes'?' · '+String(relative[1]):''),category,target,url:slot.url,context};
 });
 if(!base.length){const details=doc.parse(creationDetails),image=details.children.find(child=>child.key==='image')?.node;result.unshift({id:'creation-cover',path:null,label:'World cover',category:'World cover',target:'WORLD_COVER',url:image?.kind==='string'?String(image.value):'',context:''});}
 return result;
}
export function assignArtwork(source:string,creationDetails:string,id:string,url:string){
 mediaUrl(url);const destination=artworkDestinations(source,creationDetails).find(item=>item.id===id);
 if(!destination)throw new Error('This artwork destination no longer exists. Select it again.');
 return destination.path?{source:assignAsset(source,destination.path,url),creationDetails}:{source,creationDetails:put(creationDetails,[],'image',JSON.stringify(url))};
}
export function artworkPrompt(destination:ArtworkDestination){
 const purpose=destination.target?imageTargets[destination.target].label:'World cover';
 const dimensions=destination.target?imageTargets[destination.target]:{width:750,height:1000};
 return `Create ${purpose.toLowerCase()} artwork for ${destination.label}.\n${destination.context}\nComposition: ${dimensions.width} × ${dimensions.height}, no UI, no watermark. Preserve the world's visual identity.`;
}
