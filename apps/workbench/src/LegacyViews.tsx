import React,{useEffect,useRef,useState} from 'react';
// @ts-ignore The mature map UI is shared with the original browser app.
import {initMapEditor} from '../../../web/map-editor.js';
// @ts-ignore The character form is shared with the original browser app.
import {initCharacterExplorer} from '../../../web/character-explorer.js';
import '../../../web/map-editor.css';import '../../../web/character-explorer.css';
import {request} from './host';
import {RegionImageAssignment} from './RegionImageAssignment';
import type {EditorSelection} from '../../../packages/core/assistant-context';
import type {Project} from '../../../packages/core/project';
import {artworkDestinations,artworkPrompt} from '../../../packages/core/artwork';
import {generateLocalArtwork} from './artwork-generation';
import type {ArtworkActivity} from './ArtworkProgress';
export function LegacyView({kind,project,compute,apply,upload,onDirtyChange,onContextChange}:{kind:'map'|'characters';project:Project;compute:(method:string,...args:any[])=>Promise<any>;apply:(text:string,base:string)=>Promise<any>;upload?:(target:string,callback:(result:any)=>Promise<any>,assetId?:string)=>void;onDirtyChange?:(dirty:boolean)=>void;onContextChange?:(selection:EditorSelection)=>void}){const host=useRef<HTMLDivElement>(null),state=useRef({project,apply,upload}),view=useRef<any>(null),mounted=useRef(false),[message,setMessage]=useState(''),[error,setError]=useState(false);state.current={project,apply,upload};
 async function generatePortrait(selection:EditorSelection,onActivity:(activity:ArtworkActivity)=>void){
  const original=state.current.project,id=JSON.stringify(selection.path?.concat('portraitUrl'));
  const destination=artworkDestinations(original.activeSource).find(item=>item.id===id);
  if(!destination)throw new Error('This character no longer has a supported portrait destination. Refresh the character.');
  return generateLocalArtwork({project:original,destination,prompt:artworkPrompt(destination),current:()=>mounted.current?state.current.project:null,assertCurrent:()=>{if(view.current?.isDirty())throw new Error('Apply or discard your character edits before generating a portrait.');},onActivity});
 }
 useEffect(()=>{mounted.current=true;const node=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};let baseline=state.current.project.activeSource;const api=async(url:string,p:any)=>{baseline=p.text;const methods:Record<string,()=>Promise<any>>={'/api/map/inspect':()=>compute('mapInspect',p.text),'/api/map/edit':async()=>({text:await compute('mapEdit',p.text,p.action,p.data)}),'/api/characters/inspect':()=>compute('charactersInspect',p.text,refs.current),'/api/characters/edit':async()=>({text:await compute('charactersEdit',p.text,p.path,p.changes,p.expected,refs.current)}),'/api/characters/create':()=>compute('charactersCreate',p.text,p.kind,p.name)};if(!methods[url])throw new Error('Unknown editor action.');return methods[url]();};const options={onDirtyChange,onContextChange,onArtwork:kind==='characters'?generatePortrait:undefined,host:host.current,api,node,getSource:()=>state.current.project.activeSource,applyText:async(text:string)=>{await state.current.apply(text,baseline);state.current.project={...state.current.project,activeSource:text};},status:(s:string,isError=false)=>{setMessage(s);setError(isError);},getProject:()=>state.current.project,confirm:async(s:string)=>window.confirm(s),imageUploads:{projectChanged:()=>{},open:({target,onUploaded,assetId}:any)=>state.current.upload?.(target,onUploaded,assetId)},uploadPortrait:(cb:any,assetId?:string)=>state.current.upload?.('NPC_PORTRAIT',cb,assetId)};view.current=kind==='map'?initMapEditor(options):initCharacterExplorer(options);void view.current.render().catch((e:Error)=>{setMessage(e.message);setError(true);});return()=>{mounted.current=false;view.current?.destroy?.();view.current?.projectChanged();host.current?.replaceChildren();};},[kind,project.id]);
 const refs=useRef<any[]>([]);useEffect(()=>{request('references').then(r=>{refs.current=r.sections;return view.current?.render();}).catch(e=>{setMessage(e.message);setError(true);});},[project.id]);
 useEffect(()=>{void view.current?.render().catch((e:Error)=>setMessage(e.message));},[project.activeSource]);
 return <div className={'legacy-view legacy-'+kind}><div className={kind==='map'?'map-with-assets':undefined}><div ref={host}/>{kind==='map'&&<RegionImageAssignment sidebar project={project} apply={async(source,base)=>{if(!await view.current?.canNavigate())throw new Error('Resolve the map form edits before assigning an image.');await apply(source,base);}}/>}</div>{message&&<p className={error?'alert':'feature-status'} role={error?'alert':'status'}>{message}</p>}</div>;
}
