import React,{useEffect,useRef,useState} from 'react';
import {assistantRecoverySettings,type AssistantRecoverySettings as RecoverySettings} from '../../../packages/core/assistant-recovery';
import {request} from './host';

export function AssistantRecoverySettings(){
 const [settings,setSettings]=useState(()=>assistantRecoverySettings()),[attempts,setAttempts]=useState('3'),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const mounted=useRef(false),busy=useRef(false);
 useEffect(()=>{mounted.current=true;void load();return ()=>{mounted.current=false;};},[]);
 async function load(){if(busy.current)return;busy.current=true;setLoading(true);setReady(false);setError('');try{const result=assistantRecoverySettings(await request('assistantRecoverySettings'));if(mounted.current){setSettings(result);setAttempts(String(result.maxAttempts));setReady(true);}}catch(failure){if(mounted.current)setError((failure as Error).message);}finally{busy.current=false;if(mounted.current)setLoading(false);}}
 async function save(value:RecoverySettings){if(busy.current)return;busy.current=true;setSaving(true);setError('');try{const result=assistantRecoverySettings(await request('saveAssistantRecoverySettings',value));if(mounted.current){setSettings(result);setAttempts(String(result.maxAttempts));}}catch(failure){if(mounted.current){setAttempts(String(settings.maxAttempts));setError((failure as Error).message);}}finally{busy.current=false;if(mounted.current)setSaving(false);}}
 function saveAttempts(){const value=Number(attempts);if(!attempts.trim()||!Number.isInteger(value)||value<1||value>10){setError('Choose a whole number from 1 to 10.');return;}if(value!==settings.maxAttempts)void save({...settings,maxAttempts:value});else setError('');}
 return <section className="connection-card"><h3>Assistant recovery</h3>
  <label><input aria-label="Automatically resolve assistant errors" type="checkbox" checked={settings.enabled} disabled={!ready||loading||saving} onChange={event=>void save({...settings,enabled:event.target.checked})}/>Automatically try to resolve assistant errors (default on)</label>
  <label>Maximum recovery attempts<input aria-label="Maximum recovery attempts" type="number" min="1" max="10" step="1" value={attempts} disabled={!ready||loading||saving||!settings.enabled} onChange={event=>setAttempts(event.target.value)} onBlur={saveAttempts} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/></label>
  <p>Default: 3 corrective attempts per task, after the initial failure. The assistant can inspect and correct recoverable local tool errors or malformed grading and field-fill responses within its existing permissions. The limit applies across the whole task and is saved when you leave the number field. Changes affect newly started tasks on this device.</p>
  <p className="muted">Extra assistant calls may use provider credits. Recovery does not bypass approvals, broaden edit scope, retry failed provider connections, or automatically replay Voyage saves, publication, uploads or image generation. Unknown remote outcomes still require reconciliation; authentication, cancellation and cooldown rules remain in force.</p>
  {loading&&<p role="status">Loading recovery preferences…</p>}{saving&&<p role="status">Saving recovery preferences…</p>}{error&&<div role="alert">{error} <button disabled={loading||saving} onClick={()=>void load()}>Reload recovery preferences</button></div>}
 </section>;
}
