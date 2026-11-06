import React,{useEffect,useRef,useState} from 'react';

export type ArtworkActivity={destination:string;purpose:string;started:number;phase:'preparing'|'generating'|'saving';provider?:string;model?:string};
export function ArtworkProgress({activity}:{activity:ArtworkActivity}){
 const [now,setNow]=useState(Date.now);
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{setNow(Date.now());panel.current?.scrollIntoView({block:'nearest'});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[activity.started]);
 const elapsed=Math.max(0,Math.floor((now-activity.started)/1000));
 const duration=elapsed<60?elapsed+'s':Math.floor(elapsed/60)+'m '+elapsed%60+'s';
 const phase=activity.phase==='preparing'?'Preparing image request':activity.phase==='saving'?'Saving generated image locally':'Generating artwork';
 return <section ref={panel} className="artwork-progress connection-card" aria-label="Artwork generation progress" aria-busy="true">
  <div role="status" aria-live="polite"><strong>{phase} for {activity.destination}</strong><p>{activity.purpose}{activity.provider?' · '+activity.provider+' · '+(activity.model||'provider default'):''}</p></div>
  <progress aria-label={phase+' for '+activity.destination}/><span className="muted" aria-live="off">Elapsed: {duration}</span>
  <p>{activity.phase==='generating'?'Waiting for the provider. It does not report a completion percentage and may take several minutes. Do not start a duplicate request.':activity.phase==='saving'?'Image received. Saving the original bytes and updating generation history.':'Checking the connection and recording this request before contacting the image provider.'} Existing artwork is unchanged; uploading and attachment are separate.</p>
 </section>;
}
