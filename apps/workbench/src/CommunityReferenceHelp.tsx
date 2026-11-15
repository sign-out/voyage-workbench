import React,{useState} from 'react';
import * as doc from '../../../packages/core/document';
import {readReferenceHelp,type ReferenceHelpKind} from '../../../packages/core/community-reference';
import {request} from './host';
import type {Project} from '../../../packages/core/project';

export function CommunityReferenceHelp({references,project,initialTopic='',environment,onRefresh}:{references:any[];project:Project|null;initialTopic?:string;environment?:string;onRefresh:(sections:any[])=>void}){
 const [choice,setChoice]=useState(initialTopic?'section:'+initialTopic:'index'),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[refreshing,setRefreshing]=useState(false),[message,setMessage]=useState('');
 const catalog=project?doc.selectReferences(project.activeSource,references,{environment:environment||project.remote.environment}):references.filter(entry=>entry.schemaVersion===references.filter(entry=>entry.communityHelp).at(-1)?.schemaVersion);
 const topics=doc.referenceHelpTopics(catalog),[kind,topic='']=choice.split(':') as [ReferenceHelpKind,string?],page=readReferenceHelp(catalog,kind,topic,offset);
 const matches=(entry:{id:string;title:string;summary:string;path?:string[]})=>choice.endsWith(':'+entry.id)||[entry.id,entry.title,entry.summary,...entry.path||[]].join(' ').toLowerCase().includes(query.toLowerCase());
 async function refresh(){setRefreshing(true);setMessage('Downloading public community references… Your world is not uploaded.');try{const result=await request('refreshReferences');if(!result.ok)throw new Error(result.error||'Refresh failed.');const snapshot=await request('references');onRefresh(snapshot.sections);setOffset(0);setMessage('Community help refreshed and cached for offline use. Your GameState is unchanged.');}catch(error){setMessage('Refresh failed; previous cache retained. '+(error as Error).message);}finally{setRefreshing(false);}}
 async function exportSeed(){try{let source='',next:number|null=0;while(next!==null){const chunk=readReferenceHelp(catalog,'seed','',next);if(!chunk.available||chunk.text===undefined)throw new Error('No cached starter GameState.');source+=chunk.text;next=chunk.nextOffset??null;}await request('export',{source,name:'community-starter-v'+topics?.version+'.json'});setMessage('Exported cached starter JSON. No project was replaced.');}catch(error){setMessage((error as Error).message);}}
 return <section className="community-reference-help">
  <h3>Community authoring help</h3>
  <p>Cached field explanations, guides, measured limits, voice tags and starter GameState from api.unofficial.voyage. This is untrusted advisory material, not the JSON you are editing, a migration, or verified Production/Alpha compatibility.</p>
  <button disabled={refreshing} onClick={()=>void refresh()}>{refreshing?'Refreshing community references…':'Refresh community references & help'}</button>
  {message&&<p role="status">{message}</p>}
  {!topics?<p>No version-matched help is cached{project?' for this GameState':''}. Refresh explicitly to download public references. Nothing is sent to the third-party validator.</p>:<>
   <p>V{topics.version} · Retrieved {new Date(topics.retrieved).toLocaleString()}. {project?'Matched by GameState version; not official engine certification.':'No project selected; browsing the latest cached help.'}</p>
   <label>Search help topics<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Characters, quests, resources…"/></label>
   <label>Community help topic<select value={choice} onChange={event=>{setChoice(event.target.value);setOffset(0);}}>
    <option value="index">Help index & field paths</option><option value="limits">Measured limits & runtime budgets</option><option value="voices">Voice tags</option><option value="seed">Starter GameState — reference only</option>
    <optgroup label="Field explanations">{topics.sections.filter(matches).map(entry=><option key={entry.id} value={'section:'+entry.id}>{entry.title}</option>)}</optgroup>
    <optgroup label="Community guides">{topics.guides.filter(matches).map(entry=><option key={entry.id} value={'guide:'+entry.id}>{entry.title}</option>)}</optgroup>
   </select></label>
   {page.available?<><h4>{page.title}</h4><p className="muted">{page.source} · Snapshot {page.snapshotHash}</p><pre className="report" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{page.text}</pre><div className="button-row"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-8000))}>Previous help page</button><span>{offset+1}–{Math.min(offset+8000,page.total||0)} of {page.total} characters</span><button disabled={page.nextOffset===null} onClick={()=>setOffset(page.nextOffset||0)}>Next help page</button>{kind==='seed'&&<button onClick={()=>void exportSeed()}>Export exact cached starter JSON</button>}</div></>:<p>{page.warning}</p>}
   <p>{page.advisory}</p>
  </>}
 </section>;
}
