import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

export function PreviewScreen({view,onViewChange,onClose,returnFocus,children}:{view:string;onViewChange:(view:string)=>void;onClose:()=>void;returnFocus?:HTMLElement|null;children:React.ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),stage=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const [zoom,setZoom]=useState('actual'),[dimensions,setDimensions]=useState({available:0,height:0});
 const width=view==='mobile'?396:1038;
 const scale=zoom==='fit'&&dimensions.available?Math.min(1,dimensions.available/width):1;
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>{element.close();returnFocus?.focus();};},[returnFocus]);
 useEffect(()=>{const update=()=>{if(stage.current&&content.current)setDimensions({available:stage.current.clientWidth,height:content.current.offsetHeight});};const observer=new ResizeObserver(update);observer.observe(stage.current!);observer.observe(content.current!);update();return()=>observer.disconnect();},[view]);
 return createPortal(<dialog ref={dialog} className="publication-preview-screen" aria-label="Public world preview screen" onCancel={event=>{event.preventDefault();onClose();}}>
  <div className="preview-screen-toolbar"><strong>Public world preview</strong><label>Viewport<select aria-label="Publication preview viewport" value={view} onChange={event=>onViewChange(event.target.value)}><option value="mobile">Phone · 396 px</option><option value="desktop">Desktop · 1038 px</option></select></label><label>Zoom<select aria-label="Publication preview zoom" value={zoom} onChange={event=>setZoom(event.target.value)}><option value="actual">Actual size · 100%</option><option value="fit">Fit width</option></select></label><button autoFocus aria-label="Close publication preview" onClick={onClose}><X size={18}/><span>Close</span></button></div>
  <p className="preview-screen-note">Local preview · approximate Alpha layouts, not the live published page. {zoom==='actual'?'1 CSS pixel = 1 screen CSS pixel. Scroll sideways if needed.':'Scaled uniformly to '+Math.round(scale*100)+'%; layout and crops stay unchanged.'}</p>
  <div ref={stage} className="preview-screen-stage"><div className="preview-screen-size" style={{width:width*scale,height:dimensions.height?dimensions.height*scale:undefined}}><div ref={content} className="preview-screen-content" style={{width,transform:`scale(${scale})`}}>{children}</div></div></div>
 </dialog>,document.body);
}
