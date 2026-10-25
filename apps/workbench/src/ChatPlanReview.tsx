import React,{useEffect,useRef,useState} from 'react';
import type {Project} from '../../../packages/core/project';
import {chatPlanContent,chatPlanTextLimit,type ChatPlan} from '../../../packages/core/chat-plans';
interface PlanDraft {title:string;text:string;expectedRevision:number}
const draftKey=(projectId:string)=>'voyage-chat-plan-draft:'+projectId;
const acknowledgedEvent='voyage-chat-plan-acknowledged';
export function readChatPlanDraft(project:Project,storage:Pick<Storage,'getItem'>):PlanDraft {
 const saved=project.chatPlan;
 const fallback={title:saved?.title||'',text:saved?.text||'',expectedRevision:saved?.revision||0};
 const raw=storage.getItem(draftKey(project.id));if(!raw)return fallback;
 const draft=JSON.parse(raw);
 if(typeof draft?.title!=='string'||draft.title.length>200||typeof draft.text!=='string'||draft.text.length>chatPlanTextLimit||!Number.isSafeInteger(draft.expectedRevision)||draft.expectedRevision<0)throw new Error('The local plan draft is invalid. Reload the saved plan to recover.');
 const matchesSaved=saved&&draft.title.trim()===saved.title&&draft.text.trim()===saved.text&&draft.expectedRevision<saved.revision;
 return {title:draft.title,text:draft.text,expectedRevision:matchesSaved?saved.revision:draft.expectedRevision};
}
export function acknowledgeChatPlanDraft(projectId:string,submitted:PlanDraft,saved:ChatPlan,storage:Pick<Storage,'getItem'|'setItem'>){
 if(saved.revision!==submitted.expectedRevision+1)throw new Error('Unexpected saved plan revision. Reload the saved plan.');
 const raw=storage.getItem(draftKey(projectId));if(!raw)return false;
 const cached=JSON.parse(raw);
 if(cached?.expectedRevision!==submitted.expectedRevision)return false;
 if(typeof cached.title!=='string'||typeof cached.text!=='string')return false;
 storage.setItem(draftKey(projectId),JSON.stringify({...cached,expectedRevision:saved.revision}));return true;
}
export function ChatPlanReview({project,busy,onSave,onBuild}:{project:Project;busy:boolean;onSave:(plan:PlanDraft)=>Promise<ChatPlan>;onBuild:(plan:ChatPlan)=>Promise<boolean>}){
 const [initial]=useState(()=>{try{return {draft:readChatPlanDraft(project,localStorage),error:''};}catch(reason){return {draft:{title:project.chatPlan?.title||'',text:project.chatPlan?.text||'',expectedRevision:project.chatPlan?.revision||0},error:String(reason instanceof Error?reason.message:reason)};}});
 const [draft,setDraft]=useState(initial.draft),[error,setError]=useState(initial.error),[storageError,setStorageError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 const inFlight=useRef(false),mounted=useRef(true),[recovered,setRecovered]=useState(!initial.error);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const acknowledged=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.projectId===project.id&&Number.isSafeInteger(detail.expectedRevision)&&detail.revision===detail.expectedRevision+1)setDraft(current=>current.expectedRevision===detail.expectedRevision?{...current,expectedRevision:detail.revision}:current);};window.addEventListener(acknowledgedEvent,acknowledged);return()=>window.removeEventListener(acknowledgedEvent,acknowledged);},[project.id]);
 useEffect(()=>{if(!recovered)return;try{localStorage.setItem('voyage-chat-plan-draft:'+project.id,JSON.stringify(draft));setStorageError('');}catch{setStorageError('This draft could not be saved on this device. Keep this window open and save the plan before leaving.');}},[draft,project.id,recovered]);
 const saved=project.chatPlan,clean=!!saved&&saved.title===draft.title.trim()&&saved.text===draft.text.trim()&&saved.revision===draft.expectedRevision;
 const conflict=draft.expectedRevision!==(saved?.revision||0);
 async function perform(action:()=>Promise<void>){if(inFlight.current)return;inFlight.current=true;setSaving(true);setError('');setNotice('');try{await action();}catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:String(reason));}finally{inFlight.current=false;if(mounted.current)setSaving(false);}}
 function reload(){if(!window.confirm('Discard this local draft and reload the saved plan?'))return;setDraft({title:saved?.title||'',text:saved?.text||'',expectedRevision:saved?.revision||0});setRecovered(true);setError('');setNotice('Saved plan reloaded.');}
 function keepEdits(){if(!window.confirm('Keep your draft text and use the current saved revision as its baseline? Your next Save will replace that saved plan.'))return;setDraft(current=>({...current,expectedRevision:saved?.revision||0}));setError('');setNotice('Your edits are preserved. Review them, then explicitly save to replace the saved plan.');}
 async function save(){
  const content=chatPlanContent(draft),submitted={...content,expectedRevision:draft.expectedRevision},result=await onSave(submitted);
  try{if(acknowledgeChatPlanDraft(project.id,submitted,result,localStorage))window.dispatchEvent(new CustomEvent(acknowledgedEvent,{detail:{projectId:project.id,expectedRevision:submitted.expectedRevision,revision:result.revision}}));}catch{if(mounted.current)setStorageError('The plan was saved, but its local draft receipt could not be updated. Reopen the saved plan or keep your edits against the current revision.');}
  if(mounted.current){setDraft(current=>current.expectedRevision===submitted.expectedRevision?{...current,expectedRevision:result.revision}:current);setNotice('Plan saved locally. Review scope before starting work.');}
 }
 return <section className="chat-plan-review" aria-label="Local plan review"><h2>Review your plan · {project.name}</h2><p>In ChatGPT, copy the response you want, then paste it here. Only this text is saved; Voyage does not read your conversation. One saved plan per project; saving replaces its previous version.</p><label>Plan title<input aria-label="Plan title" disabled={saving||!recovered} maxLength={200} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label><label>Plan text<textarea aria-label="Plan text" disabled={saving||!recovered} placeholder="Paste the copied response here, then edit it before saving…" maxLength={chatPlanTextLimit} value={draft.text} onChange={event=>setDraft({...draft,text:event.target.value})}/></label><p>Plans stay in the local project, not playable-world exports. Saving does not contact a model or change your world.</p><div className="button-row"><button disabled={busy||saving||!recovered||!draft.title.trim()||!draft.text.trim()||clean} onClick={()=>void perform(save)}>Save plan locally</button><button disabled={busy||saving||!recovered||!clean} onClick={()=>void perform(async()=>{if(saved)await onBuild(saved);})}>Build this plan…</button><button disabled={saving} onClick={reload}>Reload saved plan</button>{conflict&&recovered&&<button disabled={saving} onClick={keepEdits}>Keep my edits against saved revision</button>}</div><p>Build this plan opens the Work Order for scope and model review. Nothing runs until you explicitly start the Work Order; normal build usage and local apply settings then apply. Only the approved plan and normal work context go to the build provider, not the chat transcript.</p>{saved&&<p>Saved revision {saved.revision}{clean?' · ready for scope review':' · save your edits before building'}.</p>}{conflict&&<p role="status">The saved plan has a different revision. Reload it, or keep your draft text and explicitly review it before replacing the saved plan.</p>}{!recovered&&<p role="alert">Reload the saved plan to recover before editing or saving.</p>}{(error||storageError)&&<p role="alert">{error||storageError}</p>}{notice&&<p role="status">{notice}</p>}</section>;
}
