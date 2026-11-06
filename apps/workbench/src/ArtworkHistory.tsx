import React,{useState} from 'react';
import type {Generation} from './artwork-generation';
import {SavedArtworkPreview} from './ArtworkPreview';

export function ArtworkHistory({jobs,busy,activeJobId,onSelect,onRefresh}:{jobs:Generation[];busy:boolean;activeJobId?:string;onSelect:(job:Generation)=>void;onRefresh:()=>void}){
 const [limit,setLimit]=useState(6);
 return <section className="artwork-generation-history" aria-label="Generated artwork gallery"><header className="artwork-history-heading"><div><h3>Generated artwork · {jobs.length} requests</h3><p>Review the actual images, inspect full size, then select one for its original destination. Nothing is attached automatically.</p></div><button disabled={busy} onClick={onRefresh}>Refresh artwork history</button></header>
  {!jobs.length&&<p>No images requested yet. Choose a destination to generate or import artwork.</p>}
  <div className="artwork-history-grid">{jobs.slice(0,limit).map(job=><article className="report artwork-history-card" key={job.id} aria-label={'Artwork for '+job.destination}>
   <header><strong>{job.destination}</strong><span className={'artwork-job-state '+job.state}>{job.state==='generated'?'Ready to review':job.state==='generating'?(job.id===activeJobId?'Generating…':'Awaiting confirmed outcome'):job.state==='uncertain'?'Outcome uncertain':job.state}</span></header>
   <small><time dateTime={new Date(job.created).toJSON()||undefined}>{new Date(job.created).toLocaleString()}</time>{job.provider?' · '+job.provider:''}{job.model?' · '+job.model:''}</small>
   {job.assetId?<SavedArtworkPreview assetId={job.assetId} name={job.destination+' generated artwork'}/>:<div className="artwork-history-placeholder">{job.state==='generating'?'The preview appears after the image is received and saved. This request may still be running or may have been interrupted.':'No image bytes saved for this attempt.'}</div>}
   {job.error&&<p className="alert">{job.error}</p>}
   {job.assetId&&<button className="primary" disabled={busy} onClick={()=>onSelect(job)}>Select saved artwork for {job.destination}</button>}
   <details><summary>Saved brief</summary><p>{job.prompt}</p></details>
  </article>)}</div>
  {jobs.length>limit&&<button onClick={()=>setLimit(value=>value+6)}>Show more artwork ({jobs.length-limit} remaining)</button>}
 </section>;
}
