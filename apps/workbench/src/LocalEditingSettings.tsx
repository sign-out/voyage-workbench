import React,{useEffect,useState} from 'react';
import {request} from './host';
import type {LocalEditMode,Task} from '../../../packages/core/project';

export function LocalEditingSettings(){
 const [mode,setMode]=useState<LocalEditMode>('automatic'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let mounted=true;void request('localEditingSettings').then(result=>{if(mounted)setMode(result.mode);}).catch(failure=>{if(mounted)setError(failure.message);}).finally(()=>{if(mounted)setLoading(false);});return ()=>{mounted=false;};},[]);
 async function save(value:LocalEditMode){setSaving(true);setError('');try{const result=await request('saveLocalEditingSettings',{mode:value});setMode(result.mode);}catch(failure){setError((failure as Error).message);}finally{setSaving(false);}}
 return <section className="connection-card"><h3>Local assistant edits</h3><label>When assistant work finishes<select aria-label="Local assistant edit mode" value={mode} disabled={loading||saving||!!error&&loading} onChange={event=>void save(event.target.value as LocalEditMode)}><option value="automatic">Apply locally automatically (default)</option><option value="proposal-only">Proposal only — review before applying locally</option></select></label><p>Completed assistant Work Orders apply to the local world automatically, with a before-change checkpoint in History. Open drafts, newer local changes, or local validation errors keep the result as a proposal instead. This setting is saved on this device and affects newly started tasks.</p><p className="muted">Planning stays read-only. Imports and restored checkpoints still require review. Voyage saves, publication, uploads and provider charges are not undone by restoring local history.</p>{saving&&<p role="status">Saving local edit preference…</p>}{error&&<p role="alert">{error}</p>}</section>;
}

export function LocalTaskOutcome({task,onHistory,onReview}:{task?:Task;onHistory:()=>void;onReview:()=>void}){
 if(task?.state==='APPLIED')return <div className="feature-status" role="status">Assistant changes applied locally. A before-change checkpoint is available in History. Nothing was uploaded to Voyage. <button onClick={onHistory}>View local history</button></div>;
 if(task?.kind==='work'&&task.state==='COMPLETED')return <p role="status">Assistant work completed without local changes.</p>;
 if(task?.state==='PROPOSAL_READY'&&task.localApplyBlockedReason)return <div className="alert" role="status">Automatic local apply paused: {task.localApplyBlockedReason} <button onClick={onReview}>Review local proposal</button></div>;
 return null;
}
