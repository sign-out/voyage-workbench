import React,{useEffect,useState} from 'react';
import {mediaUrl} from '../../../packages/core/studio';
import {feature,type Asset} from './features-api';
import {ImageInspection} from './ImageInspection';

export function ArtworkPreview({url,name}:{url:string;name:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 let safe='';try{safe=url.startsWith('data:image/')?url:mediaUrl(url);}catch{}
 return safe&&!failed?<ImageInspection url={safe} name={name}><img className="artwork-preview-image" src={safe} alt={name} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/></ImageInspection>:<div className="artwork-empty-preview">{failed?'Image preview unavailable. The reference is retained.':'No artwork attached yet'}</div>;
}

export function SavedArtworkPreview({assetId,name}:{assetId:string;name:string}){
 const [result,setResult]=useState<{id:string;asset?:Asset;error?:string}>();
 useEffect(()=>{
  let active=true;
  void feature<Asset|null>('asset:'+assetId,null).then(asset=>{if(active)setResult({id:assetId,...(asset?{asset}:{error:'Saved image bytes are missing. The history record is retained.'})});}).catch(reason=>{if(active)setResult({id:assetId,error:'Could not load this saved image: '+(reason as Error).message});});
  return()=>{active=false;};
 },[assetId]);
 if(result?.id!==assetId)return <p role="status">Loading artwork for {name}…</p>;
 return result.asset?<ArtworkPreview url={result.asset.dataUrl} name={name}/>:<p role="status">{result.error}</p>;
}
