import React,{useEffect,useRef,useState} from 'react';
import {request} from './host';
import type {Project} from '../../../packages/core/project';
import type {ChatPlan} from '../../../packages/core/chat-plans';
import {ChatPlanReview} from './ChatPlanReview';

export function ChatPlanningPanel({project,busy=false,onSave,onBuild}:{project?:Project|null;busy?:boolean;onSave?:(plan:{title:string;text:string;expectedRevision:number})=>Promise<ChatPlan>;onBuild?:(plan:ChatPlan)=>Promise<boolean>}){
 const [open,setOpen]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[stalled,setStalled]=useState(false);
 const [review,setReview]=useState(false);
 const target=useRef<HTMLDivElement>(null),launcher=useRef<HTMLButtonElement>(null);
 async function copyDiagnostics(){try{const diagnostics=await request('chatPanelDiagnostics');await request('copyText',{text:JSON.stringify(diagnostics,null,2)});setStatus('Diagnostics copied — origins and error codes only, no credentials or chat text.');}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}}
 useEffect(()=>{
  if(!open||review)return;
  const element=target.current;if(!element)return;
  let active=true,frame=0;
  function report(reason:unknown){if(active)setError(reason instanceof Error?reason.message:String(reason));}
  function position(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!active)return;const bounds=element!.getBoundingClientRect();void request('chatPanelShow',{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}).catch(report);});}
  const observer=new ResizeObserver(position);observer.observe(element);window.addEventListener('resize',position);position();
  const timer=setInterval(()=>{void request('chatPanelStatus').then(value=>{if(active){setStatus(value.phase);setError(value.failure);setStalled(value.stalled===true);}}).catch(report);},1000);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};window.addEventListener('keydown',escape);
  return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('keydown',escape);clearInterval(timer);void request('chatPanelHide').catch(()=>{});launcher.current?.focus();};
 },[open,review]);
 return <>{!open&&<button ref={launcher} className="chatgpt-panel-launcher" onClick={()=>{setError('');setOpen(true);}}>ChatGPT Chat · Preview</button>}{open&&<section className="chatgpt-panel" role="dialog" aria-modal="true" aria-label="ChatGPT Chat preview"><div className="chatgpt-panel-toolbar"><div><strong>ChatGPT Chat · Experimental</strong><p>No world context is sent automatically. Copy a response, save a local plan, then explicitly approve a Work Order.</p></div>{!review&&<><button disabled={!project||!onSave||!onBuild} onClick={()=>{setError('');setReview(true);}}>Save response as plan</button><button onClick={()=>void request('chatPanelHome').catch(reason=>setError(reason.message))}>Home</button><button onClick={()=>void request('chatPanelReload').catch(reason=>setError(reason.message))}>Reload</button><button onClick={()=>void copyDiagnostics()}>Copy diagnostics</button><button onClick={()=>void request('openExternal',{url:'https://chatgpt.com/'}).catch(reason=>setError(reason.message))}>Open in browser</button></>}{review&&<button onClick={()=>setReview(false)}>Back to ChatGPT</button>}<button autoFocus onClick={()=>setOpen(false)}>Close Chat</button></div>{!review&&<><div className="chatgpt-panel-status" role="status">{error||status||'Opening isolated ChatGPT session…'}</div><div ref={target} className="chatgpt-panel-page">{stalled&&<div className="chatgpt-panel-recovery"><h2>ChatGPT sign-in has not finished loading</h2><p>The embedded page stalled. Your world is unchanged. Use Home to return to ChatGPT, or Open in browser to compare sign-in outside Electron.</p><p>Copy diagnostics includes only origins and error codes, not your username, password, cookies, or chat content.</p></div>}</div></>}{review&&project&&onSave&&onBuild&&<ChatPlanReview key={project.id} project={project} busy={busy} onSave={onSave} onBuild={async plan=>{const loaded=await onBuild(plan);if(loaded)setOpen(false);return loaded;}}/>}</section>}</>;
}
