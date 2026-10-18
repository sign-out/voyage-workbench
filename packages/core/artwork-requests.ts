import {artworkDestinations} from './artwork';

export interface ArtworkRequest {destinationId:string;prompt:string}
export interface ArtworkProposal extends ArtworkRequest {id:string;taskId:string;baseHash:string;label:string;created:number}
export interface ArtworkPlanningContext {artworkDestinations:{id:string;label:string;category:string;hasArtwork:boolean}[];artworkDestinationsTruncated:boolean;artworkDestinationsUnavailable?:string}
export function artworkPlanningContext(source?:string):Partial<ArtworkPlanningContext>{
 if(source===undefined)return {};
 try{
  const destinations=artworkDestinations(source).filter(item=>item.target);
  return {artworkDestinations:destinations.slice(0,500).map(({id,label,category,url})=>({id,label,category,hasArtwork:!!url})),artworkDestinationsTruncated:destinations.length>500};
 }catch{
  return {artworkDestinations:[],artworkDestinationsTruncated:true,artworkDestinationsUnavailable:'The artwork catalog exceeded its inspection limits. Continue using scoped world tools; do not claim a complete artwork inventory.'};
 }
}
export function proposedArtwork(source:string,input:unknown):ArtworkRequest&{label:string}{
 if(!input||typeof input!=='object')throw new Error('Provide an artwork destination and brief.');
 const {destinationId,prompt}=input as ArtworkRequest;
 if(typeof destinationId!=='string'||typeof prompt!=='string'||!prompt.trim()||prompt.length>12000)throw new Error('Provide a destination ID and an artwork brief of 1–12000 characters.');
 const destination=artworkDestinations(source).find(item=>item.id===destinationId&&item.target);
 if(!destination)throw new Error('Choose an existing supported artwork destination from the artworkDestinations packet.');
 return {destinationId,prompt:prompt.trim(),label:destination.label};
}
