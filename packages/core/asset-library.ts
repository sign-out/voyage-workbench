import {sha256} from 'js-sha256';
import {mediaUrl} from './studio';
export type RemoteAsset={url:string;target?:string;state:'existing'|'reserved'|'durable';expiresAt?:number;created:number;environment?:string;uploadId?:string};
export type LibraryAsset={id:string;name:string;aliases:string[];kind:'image'|'audio';mime:string;created:number;storageId?:string;sha256?:string;bytes?:number;remote:RemoteAsset[];tags:string[]};
export function latitudeUrl(value:string){try{const host=new URL(mediaUrl(value)).hostname;return /^latitude-[a-z0-9-]+\.b-cdn\.net$/.test(host)||host==='images.aidungeon.com';}catch{return false;}}
export function inspectMedia(dataUrl:string){
 const match=/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
 if(!match||match[2].length>45*1024*1024)throw new Error('Unsupported or oversized media data.');
 const binary=atob(match[2]),bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
 const header=binary.slice(0,16);let mime='';
 if(header.startsWith('\x89PNG\r\n\x1a\n'))mime='image/png';
 else if(header.startsWith('\xff\xd8\xff'))mime='image/jpeg';
 else if(header.startsWith('RIFF')&&header.slice(8,12)==='WEBP')mime='image/webp';
 else if(header.startsWith('RIFF')&&header.slice(8,12)==='WAVE')mime='audio/wav';
 else if(header.startsWith('OggS'))mime='audio/ogg';
 else if(header.startsWith('ID3')||bytes[0]===255&&(bytes[1]&224)===224&&(bytes[1]&6)!==0)mime='audio/mpeg';
 else if(header.slice(4,8)==='ftyp'&&/^audio\/(mp4|x-m4a)$/.test(match[1]))mime='audio/mp4';
 if(!mime)throw new Error('Choose PNG, JPEG, WebP, MP3, WAV, OGG, or M4A with valid file headers.');
 const kind=mime.startsWith('audio/')?'audio':'image';
 if(!bytes.length||bytes.length>(kind==='audio'?25:32)*1024*1024)throw new Error(kind==='audio'?'Music exceeds 25 MiB.':'Image exceeds 32 MiB.');
 return {mime,kind:kind as 'audio'|'image',bytes:bytes.length,sha256:sha256(bytes)};
}
export function mergeLibraryAsset(records:LibraryAsset[],incoming:LibraryAsset){
 const matches=(record:LibraryAsset)=>record.id===incoming.id||!!incoming.sha256&&record.sha256===incoming.sha256||!(incoming.sha256&&record.sha256&&incoming.sha256!==record.sha256)&&incoming.remote.some(remote=>record.remote.some(existing=>existing.url===remote.url));
 const index=records.findIndex(matches);
 if(index<0){if(records.length>=5000)throw new Error('Library limit reached (5,000 assets). No existing assets were removed.');return [incoming,...records];}
 let merged=records[index];
 for(const item of records.filter((record,position)=>position!==index&&matches(record)).concat(incoming)){
  const remote=merged.remote.slice();
  for(const reference of item.remote){const existing=remote.findIndex(value=>value.url===reference.url&&value.target===reference.target);if(existing<0)remote.push(reference);else if(remote[existing].state==='reserved'&&reference.state==='existing')continue;else remote[existing]={...remote[existing],...reference,state:remote[existing].state==='durable'?'durable':reference.state};}
  merged={...merged,mime:!merged.storageId&&item.storageId?item.mime:merged.mime,storageId:merged.storageId||item.storageId,sha256:merged.sha256||item.sha256,bytes:merged.bytes??item.bytes,aliases:[...new Set(merged.aliases.concat(item.aliases,item.name))].filter(name=>name!==merged.name).slice(0,100),remote,tags:[...new Set(merged.tags.concat(item.tags))]};
 }
 return records.flatMap((record,position)=>position===index?[merged]:matches(record)?[]:[record]);
}
export function reusableRemote(asset:LibraryAsset,target?:string,now=Date.now()){
 return asset.remote.find(remote=>(!target||!remote.target||remote.target===target)&&(remote.state!=='reserved'||!!remote.expiresAt&&remote.expiresAt>now));
}
