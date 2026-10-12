import React,{useMemo,useState} from 'react';
import {edit,parse,type Path} from '../../../packages/core/document';
import {StructuredEditor} from './StructuredEditor';
import type {Schema} from './structured-source';
import {JsonEditor} from './JsonEditor';
import {formatJson} from './json-highlight';

// Keep JSON text authoritative so switching views never rounds numeric tokens.
export function ValueEditor({text,onChange,readOnly=false,schema,view,onViewChange,worldSource,section,basePath=[],onCopy,onExport}:{text:string;onChange:(text:string)=>void;readOnly?:boolean;schema?:Schema;view?:'form'|'json';onViewChange?:(view:'form'|'json')=>void;worldSource?:string;section?:string;basePath?:Path;onCopy?:(text:string)=>Promise<unknown>;onExport?:(text:string)=>Promise<{saved?:boolean}>}){
 let valid=true;try{parse(text);}catch{valid=false;}
 const [localForm,setLocalForm]=useState(valid),form=view?view==='form':localForm;
 const [transferStatus,setTransferStatus]=useState(''),[transferring,setTransferring]=useState(false);
 const referenceSource=useMemo(()=>{if(!worldSource)return text;try{return edit(worldSource,basePath,text);}catch{return worldSource;}},[worldSource,text,JSON.stringify(basePath)]);
 async function transfer(kind:'copy'|'export'){
  setTransferring(true);setTransferStatus('');
  try{if(kind==='copy'){await onCopy?.(text);setTransferStatus('Copied the current draft JSON.');}else{const result=await onExport?.(text);setTransferStatus(result?.saved?'Exported the current draft JSON.':'Export cancelled; the draft is unchanged.');}}catch(reason){setTransferStatus((kind==='copy'?'Copy':'Export')+' failed: '+(reason instanceof Error?reason.message:String(reason)));}finally{setTransferring(false);}
 }
 const toggle=()=>{if(onViewChange)onViewChange(form?'json':'form');else setLocalForm(!form);};
 return <><div className="editor-caption"><span>{form?'FORM VIEW':'JSON VIEW'}</span><div><button aria-label={form?'Switch to JSON view':'Switch to Form view'} onClick={toggle}>{form?'{ } JSON':'✎ Form'}</button>{!form&&<button disabled={readOnly||!valid} onClick={()=>{onChange(formatJson(text));setTransferStatus('Formatted whitespace; values and numeric tokens are unchanged.');}}>Format JSON</button>}{onCopy&&<button disabled={transferring} onClick={()=>void transfer('copy')}>Copy JSON</button>}{onExport&&<button disabled={transferring||!text.length} onClick={()=>void transfer('export')}>Export selection</button>}<span>Same draft · numbers and unknown fields stay exact</span></div></div>{transferStatus&&<p className="editor-transfer-status" role="status">{transferStatus}</p>}
 {valid&&<div className="editor-form-view" hidden={!form}><StructuredEditor text={text} onChange={onChange} readOnly={readOnly} schema={schema} worldSource={referenceSource} section={section} basePath={basePath}/></div>}
 {form&&!valid&&<div className="padded" role="status">This draft is not valid JSON yet. Switch to JSON view to continue editing; your text is preserved.</div>}
 {!form&&<>{!valid&&<p className="editor-transfer-status" role="status">JSON is incomplete or invalid. Your draft text is preserved; repair it before applying.</p>}<JsonEditor text={text} onChange={onChange} readOnly={readOnly}/></>}</>;
}
