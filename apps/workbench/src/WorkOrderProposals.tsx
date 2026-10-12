import React,{useEffect,useState} from 'react';
import {hash,type Project,type WorkOrder} from '../../../packages/core/project';
import {pageOffset} from './paging';
export function WorkOrderProposals({project,busy,onLoad,onDismiss}:{project:Project;busy:boolean;onLoad:(order:WorkOrder)=>void;onDismiss:(id:string)=>void}){
 const proposals=project.workOrderProposals||[],currentHash=hash(project.activeSource);
 const [offset,setOffset]=useState(0);useEffect(()=>setOffset(0),[project.id]);
 useEffect(()=>setOffset(current=>pageOffset(current,proposals.length,10)),[proposals.length]);
 if(!proposals.length)return null;
 return <section aria-label="Suggested Work Orders"><h3>Suggested Work Orders</h3><p className="muted">Planner suggestions do not approve or run work. Load one into the form, review its scope, then explicitly approve it.</p>{proposals.slice(offset,offset+10).map(proposal=>{
  const stale=proposal.baseHash!==currentHash;
  return <article className="connection-card" key={proposal.id}><h4>{proposal.order.objective}</h4><ul>{proposal.order.requirements.map((requirement,index)=><li key={index}>{requirement}</li>)}</ul><p>{proposal.order.wholeWorld?'Scope: whole authored world':'Scope: selected paths'}</p><pre className="report">{JSON.stringify(proposal.order.allowedPaths,null,2)}</pre>{stale&&<p role="status">The world changed since this suggestion. Ask the planner to refresh it before loading.</p>}<div className="button-row"><button disabled={busy||stale} onClick={()=>onLoad({...proposal.order,sourceProposalId:proposal.id})}>Load into Work Order</button><button disabled={busy} onClick={()=>onDismiss(proposal.id)}>Dismiss suggestion</button></div></article>;
 })}{proposals.length>10&&<div className="button-row"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-10))}>Previous suggestions</button><span>{offset+1}–{Math.min(offset+10,proposals.length)} of {proposals.length}</span><button disabled={offset+10>=proposals.length} onClick={()=>setOffset(offset+10)}>Next suggestions</button></div>}</section>;
}
