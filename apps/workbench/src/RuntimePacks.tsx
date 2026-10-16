import React,{useEffect,useState} from 'react';
import {request} from './host';

export type RuntimePackStatus={edition:'full'|'lightweight';providers:{id:string;installed:boolean;version:string;downloadBytes:number}[];busy:boolean;phase:string;message:string;downloaded:number;total:number;canInstall:boolean};
const names:Record<string,string>={codex:'Codex',claude:'Claude Code',cursor:'Cursor SDK'};
export const runtimeSize=(bytes:number)=>(bytes/1024/1024).toFixed(1)+' MiB';

export function RuntimePackList({status,blocked=false,onInstall,onPermission,onCancel,onApproval}:{status:RuntimePackStatus;blocked?:boolean;onInstall:(provider:string)=>void;onPermission:()=>void;onCancel:()=>void;onApproval?:()=>void}){
 return <section className="connection-card" aria-label="On-device runtimes"><h3>On-device runtimes</h3>
 <p>{status.edition==='full'?'Full/offline edition: all three official provider runtimes are bundled.':'Lightweight edition: install only the official provider you need. Shared support is downloaded once.'} No inference, account sign-in, or API fallback occurs during installation.</p>
 {status.edition==='lightweight'&&<p className="muted">Packs use the qualified versions pinned to this app release, built from official upstream packages. Downloads come from the Workbench release repository. Android asks for approval and may restart the app; save settings first. Updating the app also updates its available pack versions.</p>}
 {blocked&&status.edition==='lightweight'&&<p role="status">Save your connection settings before installing runtimes.</p>}
 {status.message&&<p role={status.phase==='failed'?'alert':'status'}>{status.message}</p>}
 {status.busy&&<div><label>Runtime download {runtimeSize(status.downloaded)} / {runtimeSize(status.total)}<progress aria-label="Runtime download" max={Math.max(1,status.total)} value={status.downloaded}/></label><button onClick={onCancel}>Cancel runtime installation</button></div>}
 {status.phase==='approval'&&<button onClick={onApproval}>Review Android installation</button>}
 {status.edition==='lightweight'&&!status.canInstall&&<button disabled={blocked||status.busy} onClick={onPermission}>Allow Android installation prompts</button>}
 {status.providers.map(provider=><div className="connection-entry" key={provider.id}><div><strong>{names[provider.id]||provider.id}</strong><p>{provider.version} · {provider.installed?'Installed and ready':status.edition==='full'?'Incomplete runtime — reinstall the full APK':'Not installed'}</p></div>{!provider.installed&&status.edition==='lightweight'&&<button disabled={blocked||status.busy||!status.canInstall} onClick={()=>onInstall(provider.id)}>Install {names[provider.id]||provider.id} · {runtimeSize(provider.downloadBytes)}</button>}</div>)}
 </section>;
}

export function RuntimePacks({blocked=false,onBusyChange}:{blocked?:boolean;onBusyChange?:(busy:boolean)=>void}){
 const [status,setStatus]=useState<RuntimePackStatus>(),[error,setError]=useState('');
 async function refresh(){try{setStatus(await request('runtimePacks'));}catch(error){setError((error as Error).message);}}
 async function act(method:string,payload:object={}){setError('');try{await request(method,payload);await refresh();}catch(error){setError((error as Error).message);}}
 useEffect(()=>{void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[]);
 useEffect(()=>{if(!status?.busy)return;const timer=setInterval(()=>void refresh(),1000);return()=>clearInterval(timer);},[status?.busy]);
 useEffect(()=>{onBusyChange?.(!!status?.busy);},[status?.busy,onBusyChange]);
 useEffect(()=>()=>onBusyChange?.(false),[onBusyChange]);
 return <>{error&&<p role="alert" className="alert">{error}</p>}{status&&<RuntimePackList status={status} blocked={blocked} onInstall={provider=>void act('runtimeInstall',{provider})} onPermission={()=>void act('runtimeInstallPermission')} onApproval={()=>void act('runtimeInstallApproval')} onCancel={()=>void act('runtimeInstallCancel')}/>}</>;
}
