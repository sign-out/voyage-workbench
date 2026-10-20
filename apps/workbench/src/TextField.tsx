import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Path} from '../../../packages/core/document';
import {FieldFillButton,useFieldFill} from './FieldFill';

export function TextField({title,value,readOnly,onChange,fieldPath}:{title:string;value:string;readOnly:boolean;onChange:(value:string)=>void;fieldPath?:Path}){
 const [expanded,setExpanded]=useState(false),launcher=useRef<HTMLButtonElement>(null);
 const fill=useFieldFill(),generated=!!fieldPath&&!!fill?.highlighted.has(JSON.stringify(fieldPath));
 return <div className={'form-field'+(generated?' field-fill-generated field-fill-completed':'')}><div className="text-field-heading"><label><span>{title}</span><textarea aria-label={title} rows={/info|background|guidance|text|description/i.test(title)?8:3} readOnly={readOnly} value={value} onChange={event=>onChange(event.target.value)}/></label><div className="text-field-tools">{fieldPath&&fill?.canFill(fieldPath)&&<FieldFillButton path={fieldPath} title={title} readOnly={readOnly}/>}<button ref={launcher} aria-label={'Expand '+title} onClick={()=>setExpanded(true)}>Expand</button></div></div><small>{value.length.toLocaleString()} characters</small>{generated&&<small className="field-fill-marker">Generated text · review before applying</small>}{expanded&&<TextScreen title={title} value={value} readOnly={readOnly} onChange={onChange} onClose={()=>setExpanded(false)} returnFocus={launcher.current}/>}</div>;
}
function TextScreen({title,value,readOnly,onChange,onClose,returnFocus}:{title:string;value:string;readOnly:boolean;onChange:(value:string)=>void;onClose:()=>void;returnFocus:HTMLElement|null}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>{element.close();returnFocus?.focus();};},[returnFocus]);
 return createPortal(<dialog ref={dialog} className="text-edit-screen" aria-label={title+' full-screen editor'} onCancel={event=>{event.preventDefault();onClose();}}><div className="text-edit-toolbar"><strong>{title}</strong><span>{value.length.toLocaleString()} characters</span><button aria-label="Close text editor" onClick={onClose}>Done</button></div><p>{readOnly?'Read-only text.':'Edits update the same local draft. Done closes this view; Apply edit still commits your changes.'}</p><textarea autoFocus aria-label={'Expanded '+title} readOnly={readOnly} value={value} onChange={event=>onChange(event.target.value)}/></dialog>,document.body);
}
