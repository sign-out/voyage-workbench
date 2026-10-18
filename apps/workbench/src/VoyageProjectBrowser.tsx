import React,{useEffect,useState} from 'react';
import {request} from './host';

export type VoyageProjectKind='world'|'mod';
export type VoyageProjectEntry={shortId:string;title?:string;visibility?:string};

export function voyageProjectEntries(result:any):VoyageProjectEntry[]{
 const rows=(result?.data||result)?.worlds;
 if(!Array.isArray(rows))throw new Error('Voyage returned an unreadable project list. Try refreshing.');
 const entries=new Map<string,VoyageProjectEntry>();
 for(const row of rows)if(typeof row?.shortId==='string'&&row.shortId.trim())entries.set(row.shortId,{shortId:row.shortId,title:typeof row.title==='string'?row.title:undefined,visibility:typeof row.visibility==='string'?row.visibility:undefined});
 return [...entries.values()];
}

export function ProjectSources({value,onChange,busy=false}:{value:'local'|VoyageProjectKind;onChange:(value:'local'|VoyageProjectKind)=>void;busy?:boolean}){
 return <div className="button-row project-sources" role="group" aria-label="Project source">
  <button disabled={busy} aria-pressed={value==='local'} onClick={()=>onChange('local')}>Local projects</button>
  <button disabled={busy} aria-pressed={value==='world'} onClick={()=>onChange('world')}>Voyage worlds</button>
  <button disabled={busy} aria-pressed={value==='mod'} onClick={()=>onChange('mod')}>Voyage mods</button>
 </div>;
}

export function VoyageProjectBrowser({kind,busy,onOpen,onConnect}:{kind:VoyageProjectKind;busy:boolean;onOpen:(entry:VoyageProjectEntry)=>Promise<unknown>;onConnect:()=>void}){
 const [connection,setConnection]=useState<any>(null),[entries,setEntries]=useState<VoyageProjectEntry[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[refresh,setRefresh]=useState(0),[query,setQuery]=useState(''),[shortId,setShortId]=useState('');
 const plural=kind==='mod'?'mods':'worlds';
 useEffect(()=>{
  let live=true;setLoading(true);setError('');setConnection(null);setEntries([]);setPage(0);setHasMore(false);
  void (async()=>{try{
   const status=await request('connection');if(!live)return;setConnection(status);
   if(status.voyage){const rows=voyageProjectEntries(await request('remoteWorlds',{type:kind,page:0}));if(live){setEntries(rows);setHasMore(rows.length>0);}}
  }catch(failure){if(live)setError((failure as Error).message);}finally{if(live)setLoading(false);}})();
  return()=>{live=false;};
 },[kind,refresh]);
 async function loadMore(){setLoading(true);setError('');try{const rows=voyageProjectEntries(await request('remoteWorlds',{type:kind,page:page+1}));setEntries(previous=>[...previous,...rows.filter(row=>!previous.some(entry=>entry.shortId===row.shortId))]);setPage(page+1);setHasMore(rows.length>0);}catch(failure){setError((failure as Error).message);}finally{setLoading(false);}}
 async function open(entry:VoyageProjectEntry){setLoading(true);setError('');try{await onOpen(entry);}catch(failure){setError((failure as Error).message);}finally{setLoading(false);}}
 return <section className="voyage-project-browser" aria-label={'Voyage '+plural} aria-busy={loading}>
  <h3>Open Voyage {plural}</h3>
  <p>Browse your owned {plural}{connection?.environment?' in '+connection.environment:''}. Opening downloads a separate local project; it never replaces your current project or saves changes to Voyage.</p>
  {error&&<p role="alert">{error}</p>}
  {loading&&<p role="status">Loading…</p>}
  {!loading&&!connection?.voyage&&<><p>Connect your Voyage Creator API key to browse and open {plural}.</p><button disabled={busy} onClick={onConnect}>Connect Voyage</button></>}
  {connection?.voyage&&<>
   <div className="button-row"><button disabled={busy||loading} onClick={()=>setRefresh(value=>value+1)}>Refresh {plural}</button><button disabled={busy||loading} onClick={onConnect}>Voyage connection</button></div>
   <label>Search loaded {plural}<input type="search" aria-label={'Search Voyage '+plural} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   {!loading&&!error&&entries.length===0&&<p>No owned {plural} were returned for this environment.</p>}
   {entries.filter(entry=>((entry.title||'')+' '+entry.shortId).toLowerCase().includes(query.toLowerCase())).map(entry=><article className="history-row" key={entry.shortId}><div><strong>{entry.title||entry.shortId}</strong><small>{[entry.visibility,entry.shortId].filter(Boolean).join(' · ')}</small></div><button disabled={busy||loading} onClick={()=>void open(entry)}>Open {kind}</button></article>)}
   {hasMore&&<button disabled={busy||loading} onClick={()=>void loadMore()}>Load more {plural}</button>}
   <form onSubmit={event=>{event.preventDefault();if(!busy&&!loading&&shortId.trim())void open({shortId:shortId.trim()});}}><label>Open by Voyage ID<input aria-label={'Voyage '+kind+' ID'} value={shortId} onChange={event=>setShortId(event.target.value)} placeholder={kind==='mod'?'Mod short ID':'World short ID'}/></label><button disabled={busy||loading||!shortId.trim()}>Open {kind} by ID</button></form>
  </>}
  {!loading&&error&&!connection?.voyage&&<button disabled={busy} onClick={()=>setRefresh(value=>value+1)}>Retry</button>}
 </section>;
}
