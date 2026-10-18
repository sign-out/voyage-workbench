import React,{useEffect,useRef,useState} from 'react';
import {hash,type Project} from '../../../packages/core/project';
import type {ArtworkProposal} from '../../../packages/core/artwork-requests';
import {resolveRoute,type TaskRoute} from '../../../packages/core/providers';
import {feature} from './feature-store';
import {request} from './host';
import {generateApprovedArtwork,type Generation} from './artwork-generation';

export function AssistantArtworkApprovals({project,blocked,onArtwork}:{project:Project;blocked:boolean;onArtwork:()=>void}){
 const [route,setRoute]=useState<TaskRoute>(),[jobs,setJobs]=useState<Generation[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const locked=useRef(false),stop=useRef(false),current=useRef(project);current.current=project;
 const proposals=project.artworkProposals||[],sourceHash=hash(project.activeSource),key='artwork-studio:'+project.id;
 async function refresh(){setReady(false);setError('');try{const [providers,history]=await Promise.all([request('providerSettings'),feature<Generation[]>(key,[])]);setJobs(history);setRoute(resolveRoute(providers.settings,'artwork'));setReady(true);}catch(reason){setError((reason as Error).message);}}
 useEffect(()=>{void refresh();return()=>{stop.current=true;};},[project.id]);
 const attempted=(proposal:ArtworkProposal)=>jobs.find(job=>job.proposalId===proposal.id);
 const pending=proposals.filter(proposal=>proposal.baseHash===sourceHash&&!attempted(proposal));
 const disabled=blocked||busy||!ready||!!project.draft||project.status!==undefined&&project.status!=='active';
 async function approve(requests:ArtworkProposal[]){
  if(disabled||locked.current||!route||!requests.length)return;
  locked.current=true;stop.current=false;setBusy(true);setError('');
  try{
   for(let index=0;index<requests.length;index++){
    if(stop.current||current.current.id!==project.id)break;
    setStatus(`Generating ${index+1} of ${requests.length}: ${requests[index].label}…`);
    await generateApprovedArtwork(project.id,requests[index],route,setJobs);
    setStatus(`${index+1} image${index?'s':''} saved locally. Nothing uploaded or attached.`);
   }
  }catch(reason){setError((reason as Error).message);}
  finally{locked.current=false;setBusy(false);}
 }
 return <article className="assistant-artwork-approvals" aria-label="Approve artwork generation"><h3>Artwork approval · {proposals.length} requests</h3><p>Provider: <strong>{route?route.name+' · '+(route.model||'provider default'):'Not ready'}</strong>. Each approved image may incur provider charges. Approval generates local images only; uploading and attachment remain separate.</p>{error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}{project.draft&&<p>Apply or discard your editor draft before approving.</p>}{blocked&&<p>Wait for the current assistant task to finish before approving.</p>}<div className="button-row"><button className="primary" disabled={disabled||!pending.length} onClick={()=>void approve(pending)}>Approve &amp; generate {pending.length} image{pending.length===1?'':'s'}</button>{busy?<button onClick={()=>{stop.current=true;setStatus('Stopping after the current image. Its provider request may already be billable.');}}>Stop after current image</button>:<button onClick={()=>void refresh()}>Refresh approvals</button>}<button onClick={onArtwork}>Review images &amp; attach</button></div><p>Only click Approve after reviewing the briefs below. Failed or interrupted requests are never retried automatically.</p>{proposals.map(proposal=>{
  const job=attempted(proposal),stale=proposal.baseHash!==sourceHash;
  return <div className="assistant-artwork-request" key={proposal.id}><strong>{proposal.label}</strong><details><summary>Review image brief</summary><p>{proposal.prompt}</p></details>{stale&&<p>The world changed. Review this request in Artwork before generating.</p>}{job&&<p>{job.state==='generated'?'Generated locally — ready to review':job.state==='generating'&&!busy?'Previous attempt interrupted or still running — check history':job.error||job.state}</p>}<button disabled={disabled||stale||!!job} onClick={()=>void approve([proposal])}>Approve &amp; generate for {proposal.label}</button></div>;
 })}</article>;
}
