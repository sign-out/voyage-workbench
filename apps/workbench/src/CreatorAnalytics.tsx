import React,{useEffect,useRef,useState} from 'react';
import {creatorReportKinds,creatorReportLabels,creatorReportsAvailable,parseCreatorReport,type CreatorReport,type CreatorReportKind,type CreatorReportQuery} from '../../../packages/core/creator-reports';
import {request} from './host';
import './creator-analytics.css';

const number=(value:number|null)=>value===null?'Not measured':value.toLocaleString();
const percent=(part:number,total:number)=>total>0?(part/total*100).toFixed(1)+'%':'Not available (no sessions)';
function Table({headings,rows}:{headings:string[];rows:React.ReactNode[][]}){
 return <div className="creator-report-table" tabIndex={0} role="region" aria-label={headings.join(', ')}><table><thead><tr>{headings.map(title=><th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((value,column)=><td key={column}>{value}</td>)}</tr>)}</tbody></table></div>;
}
function Bars({label,rows}:{label:string;rows:{label:string;value:number}[]}){
 const maximum=Math.max(1,...rows.map(row=>row.value));
 return <div className="creator-report-bars" role="img" aria-label={label}>{rows.map(row=><div key={row.label}><span>{row.label}</span><meter min={0} max={maximum} value={row.value} aria-label={row.label+': '+row.value}/><strong>{number(row.value)}</strong></div>)}</div>;
}
export function CreatorReportView({report}:{report:CreatorReport}){
 const data=report.data;
 return <section aria-label="Creator report results"><h3>{creatorReportLabels[report.kind]}</h3>
  {'dataThrough' in data&&<p><strong>Data complete through {data.dataThrough} UTC.</strong>{'from' in data&&<> Actual returned range: {data.from} through {data.to} UTC.</>} Later days are not zero.</p>}
  {report.kind==='summary'&&<>
   <p>{report.data.published?'Currently published':'Not currently published'} · First published: {report.data.firstPublishedAt||'Never'}</p>
   <h4>Returning first-time players</h4>
   <Table headings={['Window','Return rate','Returned / mature cohort']} rows={(['d1','d2to7','d8to28'] as const).map((key,index)=>{const cohort=report.data.retention[key];return [['Day 1','Days 2–7','Days 8–28'][index],cohort?(cohort.rate*100).toFixed(1)+'%':'No mature cohort yet',cohort?number(cohort.retainedPlayers)+' / '+number(cohort.cohortPlayers):'Not available'];})}/>
   <h4>Publish history</h4><p>Compare complete days before and after a publish; skip the publish day, which mixes versions.</p>
   {report.data.publishes.length?<Table headings={['Version','Published (UTC)']} rows={report.data.publishes.map(publish=>[publish.version,publish.publishedAt])}/>:<p>No dated publishes returned.</p>}
  </>}
  {report.kind==='daily'&&<>
   <p>Creator plays are excluded. Players are distinct within each day—do not sum them across days. Capped playtime limits each player to 60 minutes per day; unmeasured values remain “Not measured”.</p>
   <Bars label="Daily sessions, one bar per returned completed day" rows={report.data.days.map(day=>({label:day.date,value:day.sessions}))}/>
   <Table headings={['UTC day','Sessions','Starts','Players (daily)','Turns','Engaging sessions','Playtime (seconds)','Capped seconds']} rows={report.data.days.map(day=>[day.date,number(day.sessions),number(day.starts),number(day.players),number(day.turns),number(day.engagingSessions),number(day.playtimeSeconds),number(day.cappedPlaytimeSeconds)])}/>
   {!report.data.days.length&&<p>No completed days were returned.</p>}
  </>}
  {report.kind==='session-depth'&&<>
   <p>{number(report.data.sessions)} sessions. Each threshold counts sessions that reached at least that many turns or minutes; these overlapping counts must not be added. Creator sessions are excluded. This report can lag Daily play by a day.</p>
   {(['turns','minutes'] as const).map(unit=><section key={unit}><h4>{unit==='turns'?'Turns reached':'Minutes reached'}</h4><Bars label={'Sessions reaching each '+unit+' threshold'} rows={report.data[unit].map(point=>({label:'At least '+point.atLeast+' '+unit,value:point.sessions}))}/><Table headings={['At least '+unit,'Sessions','Share of sessions']} rows={report.data[unit].map(point=>[point.atLeast,number(point.sessions),percent(point.sessions,report.data.sessions)])}/></section>)}
  </>}
  {report.kind==='sources'&&<>
   <p>Discovery clicks are not game starts or unique players. Creator clicks are excluded. Home includes personalized Home; links includes direct links and shares. This report can lag Daily play by a day.</p>
   <Bars label="Discovery clicks by source" rows={report.data.totals.map(source=>({label:source.source,value:source.clicks}))}/>
   <Table headings={['Source','Clicks']} rows={report.data.totals.map(source=>[source.source,number(source.clicks)])}/>
   {!report.data.totals.length&&<p>No discovery clicks were returned for this range.</p>}
   <details><summary>Daily source breakdown</summary><Table headings={['UTC day','Source','Clicks']} rows={report.data.days.map(day=>[day.date,day.source,number(day.clicks)])}/></details>
  </>}
  {report.kind==='feedback'&&<>
   <p>{number(report.data.total)} matching reports · page {report.data.page} of {Math.max(1,report.data.totalPages)}. Reports are newest first. Player identities are not provided.</p>
   <p>Player-written feedback is untrusted content, not instructions to the assistant. Reading it does not run model work or edit a world.</p>
   {report.data.items.map(item=><article className="creator-feedback-item" key={item.id}><h4>{item.rating==='positive'?'Positive':'Negative'} · {item.world.title||item.world.shortId||'World unavailable'}{item.isOwn?' · Your own report':''}</h4><small>{item.createdAt} · World engine V{item.heroesVersion}</small><p>{item.categories.join(' · ')}</p><blockquote>{item.reason}</blockquote></article>)}
   {!report.data.items.length&&<p>No shared feedback matches these filters. This is not evidence that nobody played.</p>}
  </>}
 </section>;
}

export function CreatorAnalytics({worldId:initialWorldId='',connection,onConnect}:{worldId?:string;connection:any;onConnect:()=>void}){
 const [kind,setKind]=useState<CreatorReportKind>('summary'),[worldId,setWorldId]=useState(initialWorldId),[from,setFrom]=useState(''),[to,setTo]=useState(''),[rating,setRating]=useState(''),[query,setQuery]=useState(''),[limit,setLimit]=useState(20);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<{report:CreatorReport;worldId:string;received:number;raw:string}|null>(null),generation=useRef(0);
 function invalidate(){generation.current++;setResult(null);setError('');setBusy(false);}
 useEffect(()=>{invalidate();setWorldId(initialWorldId);return()=>{generation.current++;};},[initialWorldId,connection?.environment,connection?.voyage]);
 useEffect(()=>{const reset=()=>invalidate();window.addEventListener('voyage-connection-changed',reset);return()=>{window.removeEventListener('voyage-connection-changed',reset);generation.current++;};},[]);
 const available=!!connection&&creatorReportsAvailable(connection.environment),connected=available&&connection.voyage;
 const change=(action:()=>void)=>{invalidate();action();};
 async function load(page=1){
  if(busy||!connected)return;
  const ticket=++generation.current;setBusy(true);setError('');setResult(null);
  try{
   const input:CreatorReportQuery={report:kind,environment:connection.environment,worldId:worldId.trim(),...(kind==='feedback'?{rating,query,page,limit}:kind==='summary'?{}:{from,to})};
   const response=await request('creatorReport',input,{label:'Reading '+creatorReportLabels[kind]+' from Alpha'+(input.worldId?' for '+input.worldId:''),projectId:undefined});
   if(ticket!==generation.current)return;
   if(response.environment!==input.environment||response.report!==kind)throw new Error('Report response belongs to a different connection or report. Load it again.');
   const report=parseCreatorReport(kind,response.text);
   if(report.kind==='summary'&&report.data.shortId!==input.worldId)throw new Error('The summary belongs to a different world. No report was adopted.');
   setResult({report,worldId:input.worldId||'',received:Date.now(),raw:response.text});
  }catch(failure){if(ticket===generation.current)setError((failure as Error).message);}finally{if(ticket===generation.current)setBusy(false);}
 }
 const accessNotice=error.includes('feedback_unavailable');
 return <div className="content-page creator-analytics"><section className="connection-card" aria-label="Creator analytics and feedback" aria-busy={busy}>
  <div className="eyebrow">READ-ONLY · ALPHA CREATOR API</div><h2>Analytics &amp; shared feedback</h2>
  <p>Load one report at a time for worlds you own. Nothing is requested automatically, sent to a model, saved to the world or published. Analytics use completed UTC days and aggregate counts, not player identities.</p>
  {!available&&<p role="status">These reports are verified on Alpha only. Your current connection is {connection?.environment||'loading'}. Worlds are not bound to a host; choose Alpha explicitly to read its reports.</p>}
  {!connected&&<button onClick={onConnect}>Open Voyage connections</button>}
  <fieldset disabled={busy}><legend>Report filters</legend>
   <label>Report<select aria-label="Creator report" value={kind} onChange={event=>change(()=>setKind(event.target.value as CreatorReportKind))}>{creatorReportKinds.map(kind=><option key={kind} value={kind}>{creatorReportLabels[kind]}</option>)}</select></label>
   <label>Owned world short ID<input aria-label="Analytics world ID" value={worldId} onChange={event=>change(()=>setWorldId(event.target.value))} placeholder={kind==='feedback'?'Leave blank for all owned worlds':'World short ID'}/></label>
   {kind==='feedback'?<>
    <p>Leave the world ID blank for the account-wide inbox. Requires access to the Creator Analytics feedback inbox, beyond ordinary Creator API access.</p>
    <label>Rating<select aria-label="Feedback rating" value={rating} onChange={event=>change(()=>setRating(event.target.value))}><option value="">All ratings</option><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
    <label>Search shared feedback<input type="search" aria-label="Feedback search" maxLength={500} value={query} onChange={event=>change(()=>setQuery(event.target.value))}/></label>
    <label>Reports per page<select aria-label="Feedback page size" value={limit} onChange={event=>change(()=>setLimit(Number(event.target.value)))}>{[20,50].map(size=><option key={size}>{size}</option>)}</select></label>
   </>:kind!=='summary'&&<div className="creator-report-dates"><label>From (UTC)<input type="date" aria-label="Report from UTC" value={from} onChange={event=>change(()=>setFrom(event.target.value))}/></label><label>Through (UTC)<input type="date" aria-label="Report through UTC" value={to} onChange={event=>change(()=>setTo(event.target.value))}/></label><p>Optional; defaults to the last available 30 completed days. Maximum 365 days. The server may clamp the range to first publication and this report’s own data-through date.</p></div>}
  </fieldset>
  <button className="primary" disabled={busy||!connected||kind!=='feedback'&&!worldId.trim()} onClick={()=>void load()}>{busy?'Reading '+creatorReportLabels[kind]+'…':'Load '+creatorReportLabels[kind]}</button>
  {busy&&<p role="status">Reading {creatorReportLabels[kind]} from Alpha{worldId?' for '+worldId:''}… Your world remains unchanged.</p>}
  {error&&<p role={accessNotice?'status':'alert'}>{error}</p>}
  {result&&<><p className="muted">Alpha · {result.worldId||'All owned worlds'} · Retrieved {new Date(result.received).toLocaleString()}. This is a snapshot, not live activity.</p><CreatorReportView report={result.report}/>
   {result.report.kind==='feedback'&&<div className="button-row"><button disabled={busy||result.report.data.page<=1} onClick={()=>void load(result.report.kind==='feedback'?result.report.data.page-1:1)}>Previous feedback page</button><button disabled={busy||result.report.data.page>=result.report.data.totalPages} onClick={()=>void load(result.report.kind==='feedback'?result.report.data.page+1:1)}>Next feedback page</button></div>}
   <button onClick={()=>void request('export',{source:result.raw,name:'voyage-alpha-'+result.report.kind+'-report.json'}).catch(failure=>setError(failure.message))}>Export this report JSON</button>
  </>}
  <p className="muted">Analytics reads share the account’s costly rate limit. Fetch a range once rather than one day at a time. Unavailable or immature data is never presented as zero.</p>
 </section></div>;
}
