import React,{createContext,useContext,useEffect,useId,useRef,useState} from 'react';
import {parse,read,type Path} from '../../../packages/core/document';
import {applyFieldFill,fieldFillCandidates,fieldFillSnapshot,undoFieldFill,type FieldFillChange,type FieldFillInput} from '../../../packages/core/field-fill';
import type {Project,Task} from '../../../packages/core/project';
import {enumValues,schemaAt,type Schema} from './structured-source';
import {referenceTarget} from './world-references';

export type FieldFillOptions={project:Project;onStart:(input:FieldFillInput)=>Promise<Task|void>;onStop:()=>Promise<void>};
type DefaultText={path:Path;value:string};
type FillChange=FieldFillChange;
const pathKey=(path:Path)=>JSON.stringify(path);
const within=(path:Path,parent:Path)=>parent.every((key,index)=>path[index]===key);
const active=(task:Task)=>['PREPARED','RUNNING'].includes(task.state);
const launchingProjects=new Set<string>();
type FillContext={source:string;basePath:Path;busy:boolean;highlighted:Set<string>;canFill:(path:Path)=>boolean;open:(path:Path,title:string)=>void;created:(path:Path,source:string,schema?:Schema)=>void;edited:(path:Path)=>void};
const FieldFillContext=createContext<FillContext|null>(null);
export const useFieldFill=()=>useContext(FieldFillContext);

export function withoutFieldFillSubtree<Field extends {path:Path}>(fields:Field[],path:Path):Field[]{return fields.filter(field=>!within(field.path,path));}
export function fieldFillHighlights(source:string,changes:FillChange[]):Set<string>{
 try{return new Set(undoFieldFill(source,changes).changes.map(change=>pathKey(change.path)));}catch{return new Set();}
}

export function newTextDefaults(source:string,path:Path,schema?:Schema):DefaultText[]{
 const node=parse(source);
 if(node.kind==='string')return schema==='string'?[{path,value:String(node.value)}]:[];
 return node.children.flatMap(child=>newTextDefaults(source.slice(child.node.start,child.node.end),path.concat(child.key),schemaAt(schema,[child.key])));
}
export function editorFillCandidates(source:string,path:Path,basePath:Path,schema?:Schema,section?:string,defaults:DefaultText[]=[]){
 const currentDefaults=defaults.filter(value=>within(value.path,path)).filter(value=>{try{return fieldFillCandidates(source,value.path,[value]).length>0;}catch{return false;}});
 return fieldFillCandidates(source,path,currentDefaults).filter(field=>within(field.path,basePath)&&!enumValues(schemaAt(schema,field.path.slice(basePath.length))).length&&!referenceTarget(section,field.path));
}
export function applyEditorFill(source:string,basePath:Path,task:Task,allowed:Path[]){
 if(!task.fieldFill)throw new Error('This task has no field-fill snapshot.');
 const result=(task.fieldFill.result||[]).filter(field=>within(field.path,basePath)&&allowed.some(path=>pathKey(path)===pathKey(field.path)));
 const applied=applyFieldFill(source,task.fieldFill,result);
 return {...applied,text:read(applied.source,basePath),skipped:task.fieldFill.fields.length-applied.changes.length};
}

export function FieldFillProvider({options,source,basePath,schema,section,onChange,children}:{options:FieldFillOptions;source:string;basePath:Path;schema?:Schema;section?:string;onChange:(text:string)=>void;children:React.ReactNode}){
 const [dialog,setDialog]=useState<{path:Path;title:string}|null>(null),[starting,setStarting]=useState(false),[owned,setOwned]=useState<Task|null>(null),[status,setStatus]=useState(''),[error,setError]=useState(''),[changes,setChanges]=useState<FillChange[]>([]),[defaults,setDefaults]=useState<DefaultText[]>([]),[stopping,setStopping]=useState(false);
 const live=useRef({source,onChange,options,schema,section,defaults}),mounted=useRef(true),launching=useRef(false),handled=useRef(new Set<string>()),cancelled=useRef(false),pending=useRef<{ids:Set<string>;snapshot:ReturnType<typeof fieldFillSnapshot>;allowed:Path[]}|null>(null),allowed=useRef<Path[]>([]);
 live.current={source,onChange,options,schema,section,defaults};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const task=owned?(options.project.tasks.find(item=>item.id===owned.id)||owned):null;
 const busy=starting||stopping||!!task&&active(task)||options.project.tasks.some(active);
 const candidates=(path:Path)=>{try{return editorFillCandidates(source,path,basePath,schema,section,defaults);}catch{return [];}};
 useEffect(()=>{
  const waiting=pending.current;if(!waiting||owned)return;
  const matches=options.project.tasks.filter(item=>!waiting.ids.has(item.id)&&item.fieldFill&&item.fieldFill.sourceHash===waiting.snapshot.sourceHash&&pathKey(item.fieldFill.path)===pathKey(waiting.snapshot.path)&&item.fieldFill.instructions===waiting.snapshot.instructions);
  if(matches.length===1){allowed.current=waiting.allowed;setOwned(matches[0]);pending.current=null;setStarting(false);}
 },[options.project.tasks,owned]);
 useEffect(()=>{
  if(!task||active(task)||handled.current.has(task.id))return;
  handled.current.add(task.id);
  if(cancelled.current||task.state==='CANCELED'){setStatus('Generation canceled. No generated text was applied.');return;}
  if(task.state!=='COMPLETED'){setError(task.error||'Generation did not complete. Your draft is unchanged.');return;}
  try{
   const current=live.current;
   const applied=applyEditorFill(current.source,basePath,task,allowed.current);
   if(applied.changes.length)current.onChange(applied.text);
   setChanges(applied.changes);setStatus(`${applied.changes.length} filled · ${applied.skipped} skipped. Edited fields and authored text stay intact. Review and apply your draft separately.`);
  }catch(reason){setError('Generated text could not be applied: '+(reason as Error).message);}
 },[task]);
 async function start(instructions:string){
  if(launching.current||launchingProjects.has(options.project.id)||busy||!dialog)return;
  const fields=candidates(dialog.path);if(!fields.length)return;
  launching.current=true;launchingProjects.add(options.project.id);cancelled.current=false;setStarting(true);setError('');setStatus('');setOwned(null);setChanges([]);
  const input:FieldFillInput={source,path:dialog.path,instructions:instructions.trim(),defaults:defaults.filter(value=>fields.some(field=>pathKey(field.path)===pathKey(value.path)))};
  try{
   const snapshot=fieldFillSnapshot(input);allowed.current=fields.map(field=>field.path);
   pending.current={ids:new Set(options.project.tasks.map(item=>item.id)),snapshot,allowed:allowed.current};
   setDialog(null);
   const started=await options.onStart(input);
   if(!mounted.current)return;
   if(started){if(!started.fieldFill||started.fieldFill.sourceHash!==snapshot.sourceHash||pathKey(started.fieldFill.path)!==pathKey(snapshot.path))throw new Error('The returned task does not match this editor request.');setOwned(started);pending.current=null;}
   if(cancelled.current)await options.onStop();
  }catch(reason){if(mounted.current){pending.current=null;setError((reason as Error).message);}}
  finally{launching.current=false;launchingProjects.delete(options.project.id);if(mounted.current&&!pending.current)setStarting(false);}
 }
 async function stop(){
  cancelled.current=true;setStopping(true);setError('');
  try{if(!launching.current)await options.onStop();if(mounted.current)setStatus('Generation canceled. No generated text will be applied.');}catch(reason){if(mounted.current)setError((reason as Error).message);}finally{if(mounted.current)setStopping(false);}
 }
 function undo(){try{const current=live.current,undone=undoFieldFill(current.source,changes);if(undone.changes.length)current.onChange(read(undone.source,basePath));setStatus(`${undone.changes.length} generated fields restored; later manual edits kept.`);setChanges([]);}catch(reason){setError((reason as Error).message);}}
 const highlighted=fieldFillHighlights(source,changes);
 return <FieldFillContext.Provider value={{source,basePath,busy,highlighted,canFill:path=>candidates(path).length>0,open:(path,title)=>{setError('');setDialog({path,title});},created:(path,value,valueSchema)=>setDefaults(current=>current.filter(item=>!within(item.path,path)).concat(newTextDefaults(value,path,valueSchema))),edited:path=>{setDefaults(current=>withoutFieldFillSubtree(current,path));setChanges(current=>withoutFieldFillSubtree(current,path));}}}>
  {children}
  <div className="field-fill-status">{(starting||task&&active(task))&&<><p role="status">{starting?'Starting generation…':`Generation ${task!.state.toLowerCase()}.`} You may keep editing this draft.</p><button type="button" disabled={stopping} onClick={()=>void stop()}>Cancel generation</button></>}{task?.route&&<small>Planning provider: {task.route.name}{task.route.model?' · '+task.route.model:''}</small>}{status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}{changes.length>0&&<button type="button" onClick={undo}>Undo generated text</button>}</div>
  {dialog&&<FieldFillDialog title={dialog.title} count={candidates(dialog.path).length} busy={busy} onStart={instructions=>void start(instructions)} onClose={()=>setDialog(null)}/>}
 </FieldFillContext.Provider>;
}

export function FieldFillButton({path,title,readOnly=false}:{path:Path;title:string;readOnly?:boolean}){
 const fill=useFieldFill();
  if(!fill||readOnly)return null;
 const available=fill.canFill(path);
 return <button type="button" className="field-fill-wand" aria-label={'Generate missing text for '+title} title={available?'Fill missing prose; authored text stays intact':'No missing prose fields to fill'} disabled={fill.busy||!available} onClick={()=>fill.open(path,title)}><span aria-hidden="true">✦</span> Fill text</button>;
}

export function FieldFillDialog({title,count,busy,onStart,onClose}:{title:string;count:number;busy:boolean;onStart:(instructions:string)=>void;onClose:()=>void}){
 const element=useRef<HTMLDialogElement>(null),instructionsId=useId(),warningId=useId(),[instructions,setInstructions]=useState('');
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=element.current!;dialog.showModal();return()=>{dialog.close();previous?.focus();};},[]);
 return <dialog ref={element} className="field-fill-dialog" aria-label={'Generate missing text for '+title} aria-describedby={warningId} onCancel={event=>{event.preventDefault();onClose();}}><form onSubmit={event=>{event.preventDefault();if(instructions.trim()&&!busy&&count)onStart(instructions);}}><h3>Fill missing text · {title}</h3><p>{count} eligible prose fields. Authored strings, IDs, references, images, code and settings are preserved.</p><label htmlFor={instructionsId}>Instructions for this generation</label><textarea id={instructionsId} autoFocus required value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="Describe the tone, details, and creative direction…"/><p>Uses the configured Planning provider selected in Models &amp; agents.</p><p id={warningId}>Your provider may charge for generation. Results update only this local editing draft, never the active world. Review and apply the draft separately.</p><div className="field-fill-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy||!count||!instructions.trim()}>Generate text</button></div></form></dialog>;
}
