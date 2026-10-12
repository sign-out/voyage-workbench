import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

function ImageScreen({url,name,onClose,returnFocus}:{url:string;name:string;onClose:()=>void;returnFocus:HTMLElement|null}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [zoom,setZoom]=useState('fit'),[size,setSize]=useState({width:0,height:0}),[failed,setFailed]=useState(false);
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>{element.close();returnFocus?.focus();};},[returnFocus]);
 return createPortal(<dialog ref={dialog} className="publication-preview-screen image-inspection-screen" aria-label="Full-size image inspection" onCancel={event=>{event.preventDefault();onClose();}}>
  <div className="preview-screen-toolbar"><strong>{name}</strong><label>Zoom<select aria-label="Image inspection zoom" value={zoom} onChange={event=>setZoom(event.target.value)}><option value="fit">Fit screen · uncropped</option><option value="actual">Actual pixels · 100%</option></select></label><button autoFocus aria-label="Close image inspection" onClick={onClose}><X size={18}/><span>Close</span></button></div>
  <p className="preview-screen-note">{size.width?`${size.width} × ${size.height} pixels · `:''}{zoom==='actual'?'One image pixel per CSS pixel. Scroll to inspect larger images.':'Entire image, scaled proportionally without cropping. This is not a public-page layout.'}</p>
  <div className={'preview-screen-stage image-inspection-stage '+zoom}>{failed?<p role="status">Image could not load.</p>:<img src={url} alt={name} referrerPolicy="no-referrer" onError={()=>setFailed(true)} onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/>}</div>
 </dialog>,document.body);
}

export function ImageInspection({url,name,children}:{url:string;name:string;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const launcher=useRef<HTMLButtonElement|null>(null);
 return <div className="image-inspection">{children}<button ref={launcher} onClick={()=>setOpen(true)} aria-label={'Inspect '+name+' full size'}>Inspect full size</button>{open&&<ImageScreen url={url} name={name} onClose={()=>setOpen(false)} returnFocus={launcher.current}/>}</div>;
}
