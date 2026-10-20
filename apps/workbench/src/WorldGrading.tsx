import React,{useId,useMemo,useRef,useState} from 'react';
import {hash,type Project} from '../../../packages/core/project';
import {bundledRubric,gradingSnapshot,parseRubric,type GradeReport,type GradeScore,type GradeSelection} from '../../../packages/core/world-grading';
import './world-grading.css';

export interface WorldGradingProps {
 project:Project;
 busy:boolean;
 onCommand:(command:any)=>Promise<any>;
 onStart:(selection:GradeSelection)=>Promise<void>;
 onStop:()=>Promise<void>;
 onNavigate:(tab:string)=>void;
}

const importLimit=512*1024;
const diagnosticNames={cover:'Cover',title:'Title',blurb:'Blurb',storyStart:'Story start',characterCreator:'Character creator'};
const numberLabel=(value:number)=>Number.isInteger(value)?String(value):value.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
const pathLabel=(path:(string|number)[])=>path.length?JSON.stringify(path):'[] (whole world)';
const errorLabel=(error:unknown)=>error instanceof Error?error.message:String(error);
const textLabel=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;

function ScoreCard({title,score}:{title:string;score:GradeScore}){
 return <article className="grading-score"><h4>{title}</h4><p className="grading-score-value">{numberLabel(score.lower)}{score.upper!==score.lower&&<>–{numberLabel(score.upper)}</>} <span>/ {numberLabel(score.max)}</span></p><p>Evidence coverage: {numberLabel(score.coverage*100)}%</p><p className="grading-muted">{score.lower===score.upper?'Fully bounded by supplied evidence.':'Interval includes missing evidence; unknown is not zero quality.'}</p><ul className="grading-sections">{score.sections.map(section=><li key={section.id}><span>{section.id}</span><strong>{numberLabel(section.lower)}{section.lower!==section.upper&&`–${numberLabel(section.upper)}`} / {numberLabel(section.max)}</strong></li>)}</ul></article>;
}

export function WorldGrading({project,busy,onCommand,onStart,onStop,onNavigate}:WorldGradingProps){
 const id=useId(),importRef=useRef(0),actionLock=useRef(false);
 const previousSelection=project.grading?.reports.slice().sort((first,second)=>second.created-first.created)[0]?.selection;
 const [path,setPath]=useState(previousSelection?.path||'universal'),[secondaryPath,setSecondaryPath]=useState(previousSelection?.secondaryPath||''),[overlay,setOverlay]=useState(previousSelection?.overlay||'standard'),[rationale,setRationale]=useState(previousSelection?.rationale||'');
 const [selectedReport,setSelectedReport]=useState(''),[pending,setPending]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const grading=project.grading;
 const rubric=grading?.rubric||bundledRubric,reports=grading?.reports||[];
 const sourceHash=useMemo(()=>hash(project.activeSource),[project.activeSource]);
 const profiles=Object.fromEntries(Object.entries(rubric.adaptive_paths.profiles).map(([key,profile])=>[key,{name:textLabel(profile.name,key),trigger:textLabel(profile.trigger)}]));
 const overlays=Object.fromEntries(Object.entries(rubric.adaptive_paths.entry_overlays).map(([key,entry])=>[key,{name:textLabel(entry.name,key),trigger:textLabel(entry.trigger)}]));
 const profileName=(key:string)=>profiles[key]?.name||key;
 const rubricHash=useMemo(()=>gradingSnapshot(rubric,{path:'universal',overlay:'standard',rationale:'Rubric identity for report staleness.'}).rubricHash,[rubric]);
 const orderedReports=[...reports].sort((first,second)=>second.created-first.created);
 const report=orderedReports.find(item=>item.id===selectedReport)||orderedReports[0];
 const latestTask=project.tasks.find(task=>!!task.grading);
 const running=!!latestTask&&['PREPARED','RUNNING','QUEUED','STARTING'].includes(latestTask.state.toUpperCase());
 const activeTask=project.tasks.find(task=>['PREPARED','RUNNING','QUEUED','STARTING'].includes(task.state.toUpperCase()));
 const locked=busy||!!activeTask||!!pending;
 const uploadContext=useRef({projectId:project.id,blocked:busy||!!activeTask});
 uploadContext.current={projectId:project.id,blocked:busy||!!activeTask};
 const selectedPath=rubric.adaptive_paths.profiles[path]?path:Object.keys(rubric.adaptive_paths.profiles)[0];
 const selectedOverlay=rubric.adaptive_paths.entry_overlays[overlay]?overlay:Object.keys(rubric.adaptive_paths.entry_overlays)[0];
 const selectedSecondary=selectedPath!=='universal'&&secondaryPath!=='universal'&&secondaryPath!==selectedPath&&rubric.adaptive_paths.profiles[secondaryPath]?secondaryPath:'';
 const sourceStale=!!report&&report.sourceHash!==sourceHash,rubricStale=!!report&&report.rubricHash!==rubricHash;
 const reportRubric=project.tasks.find(task=>task.id===report?.taskId)?.grading?.rubric||(!rubricStale?rubric:undefined);
 const perform=async(label:string,action:()=>Promise<unknown>)=>{
  if(actionLock.current)return;
  actionLock.current=true;setError('');setNotice('');setPending(label);
  try{await action();}catch(reason){setError(errorLabel(reason));}finally{actionLock.current=false;setPending('');}
 };
 const importRubric=async(file:File)=>{
  if(locked)return;
  const attempt=++importRef.current;
  const projectId=project.id;
  await perform('Importing rubric',async()=>{
   if(file.size>importLimit)throw new Error('Rubric files must be 512 KiB or smaller. The current rubric has not changed.');
   const text=await file.text();
   if(attempt!==importRef.current)return;
   const parsed=parseRubric(JSON.parse(text));
   if(uploadContext.current.projectId!==projectId||uploadContext.current.blocked)throw new Error('The project or assistant state changed during import. No rubric was replaced; retry when the assistant is idle.');
   await onCommand({type:'gradingRubric',rubric:parsed});
   setNotice('Rubric imported. Previous reports are retained; grading only starts when you choose Grade.');
  });
 };
 const downloadRubric=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(rubric,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`world-rubric-${rubric.version}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <section className="content-page grading-page" aria-labelledby={`${id}-title`}>
  <div className="grading-heading"><div><p className="grading-eyebrow">World assistant · source assessment</p><h2 id={`${id}-title`}>World Grading</h2><p>Understand the promise, inspect the evidence, prioritize the next revision.</p></div><span className="grading-badge">Read-only assessment</span></div>
  <div className="grading-safety" id={`${id}-safety`}><strong>Source-only, not runtime certification.</strong><p>Grading reads a snapshot of the applied world source and configured rubric. It cannot establish playability, runtime success, player enjoyment, or release certification. Missing artifacts remain not evidenced (NE).</p><p>Choosing Grade or Regrade starts a model request; API providers may charge. Nothing runs automatically, and no fixes are applied.</p></div>
  <section className="grading-panel" aria-labelledby={`${id}-rubric-title`}><div className="grading-heading"><div><h3 id={`${id}-rubric-title`}>Assessment rubric</h3><p>{rubric.title} · v{rubric.version}</p></div><span className="grading-badge">{grading?.rubric?'Imported rubric':'Built-in rubric v1.6'}</span></div><div className="grading-actions"><label className="grading-file" htmlFor={`${id}-import`}>Import / update rubric JSON <span>(maximum 512 KiB)</span><input id={`${id}-import`} type="file" accept=".json,application/json" disabled={locked} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void importRubric(file);}}/></label><button type="button" disabled={!!pending} onClick={downloadRubric}>Download rubric</button><button type="button" disabled={locked||!grading?.rubric} onClick={()=>void perform('Resetting rubric',async()=>{await onCommand({type:'gradingRubric',rubric:undefined});setNotice('Built-in rubric restored. Previous reports are retained.');})}>Reset to built-in</button></div><p className="grading-muted">Imports are validated before replacing the rubric. Changing a rubric never rewrites a previous report.</p></section>
  <form className="grading-panel" aria-labelledby={`${id}-selection-title`} aria-describedby={`${id}-safety`} onSubmit={event=>{event.preventDefault();if(locked||project.draft||!rationale.trim())return;setSelectedReport('');void perform('Starting assessment',()=>onStart({path:selectedPath,...(selectedSecondary?{secondaryPath:selectedSecondary}:{}),overlay:selectedOverlay,rationale:rationale.trim()}));}}>
   <h3 id={`${id}-selection-title`}>Precommit the assessment lens</h3><p>Choose from the blurb promise, default opening activity, and repeatable source-backed loop—not whichever path scores highest. Universal is always reported; a genuine hybrid blends primary / secondary 70 / 30.</p>
   <fieldset disabled={locked}><legend>Genre path and entry overlay</legend><div className="grading-form-grid">
    <label htmlFor={`${id}-path`}>Primary genre path<select id={`${id}-path`} value={selectedPath} onChange={event=>setPath(event.target.value)}>{Object.entries(profiles).map(([key,profile])=><option key={key} value={key}>{profile.name}</option>)}</select></label>
    <label htmlFor={`${id}-secondary`}>Secondary hybrid path (optional)<select id={`${id}-secondary`} disabled={selectedPath==='universal'} value={selectedSecondary} onChange={event=>setSecondaryPath(event.target.value)}><option value="">No secondary path</option>{Object.entries(profiles).filter(([key])=>key!==selectedPath&&key!=='universal').map(([key,profile])=><option key={key} value={key}>{profile.name}</option>)}</select><span className="grading-muted">Hybrids require two distinct specialist paths.</span></label>
    <label htmlFor={`${id}-overlay`}>Entry overlay<select id={`${id}-overlay`} value={selectedOverlay} onChange={event=>setOverlay(event.target.value)}>{Object.entries(overlays).map(([key,entry])=><option key={key} value={key}>{entry.name}</option>)}</select></label>
   </div><p className="grading-muted">{profiles[selectedPath]?.trigger} {overlays[selectedOverlay]?.trigger}</p><label htmlFor={`${id}-rationale`}>Path and overlay rationale (required before grading)<textarea id={`${id}-rationale`} required maxLength={10000} rows={4} value={rationale} aria-describedby={`${id}-rationale-help`} onChange={event=>setRationale(event.target.value)} placeholder="Cite the source signals that justify this path, any hybrid, and the entry overlay."/></label><p className="grading-muted" id={`${id}-rationale-help`}>The selection and rationale are recorded with the report; changing this form does not change past assessments.</p></fieldset>
   {project.draft&&<p className="grading-warning" role="status">Unapplied draft: apply or discard the world draft before grading. Only applied source can be assessed.</p>}
   {activeTask&&!running&&<p className="grading-warning" role="status">Finish or stop the existing assistant task before grading or suggesting fixes. Its current state is {activeTask.state.toLowerCase()}.</p>}
   <div className="grading-actions"><button className="primary" type="submit" disabled={locked||!!project.draft||!rationale.trim()}>{reports.length?'Regrade world':'Grade world'}</button><span className="grading-muted">Explicit request only · previous reports retained</span></div>
  </form>
  <div aria-live="polite" role="status" className="grading-status">{running?`Assessment ${latestTask.state.toLowerCase()}. Previous reports remain available.`:pending||notice||'Ready when you are. No automatic grading.'}</div>
  {running&&<button type="button" disabled={!!pending} onClick={()=>void perform('Stopping assessment',onStop)}>Cancel grading</button>}
  {latestTask&&!running&&<p className="grading-muted">Last assessment: {latestTask.state.toLowerCase().replaceAll('_',' ')}. {latestTask.state.toUpperCase().includes('CANCEL')?'Cancelled assessments do not replace previous reports.':''}</p>}
  {(error||latestTask?.error)&&<p className="grading-error" role="alert">{error||latestTask?.error}</p>}
  {!report?<div className="grading-empty"><h3>Your first assessment starts here</h3><p>Precommit a lens and rationale, then choose Grade world. You’ll receive evidence-backed feedback, score intervals, and prioritized opportunities—not automatic edits.</p></div>:<section className="grading-report" aria-labelledby={`${id}-report-title`}>
   <div className="grading-heading"><div><h3 id={`${id}-report-title`}>Assessment report</h3><p>{report.rubricTitle} · v{report.rubricVersion}</p></div><label htmlFor={`${id}-history`}>Report history<select id={`${id}-history`} value={report.id} onChange={event=>setSelectedReport(event.target.value)}>{orderedReports.map((item,index)=><option key={item.id} value={item.id}>{new Date(item.created).toLocaleString()} · v{item.rubricVersion} · {item.id}{index===0?' · latest':''}</option>)}</select></label></div>
   <div className="grading-actions"><span className={`grading-badge${sourceStale?' grading-badge-warning':''}`}>{sourceStale?'Source changed · stale report':'Source matches current world'}</span><span className={`grading-badge${rubricStale?' grading-badge-warning':''}`}>{rubricStale?'Rubric changed · stale report':'Rubric matches current rubric'}</span></div>
   {(sourceStale||rubricStale)&&<p className="grading-warning">This report describes its saved snapshot, not the current configuration. Regrade explicitly for a fresh assessment. Stale fixes cannot be suggested.</p>}
   <p className="grading-report-summary">{report.summary}</p><p><strong>Committed lens:</strong> {rubricStale?report.selection.path:profileName(report.selection.path)}{report.selection.secondaryPath&&` + ${rubricStale?report.selection.secondaryPath:profileName(report.selection.secondaryPath)} (70 / 30)`} · {report.selection.overlay}</p><p><strong>Rationale:</strong> {report.selection.rationale}</p><p><strong>Published intent:</strong> {report.intent}</p>
   <div className="grading-score-grid"><ScoreCard title="Universal anchor" score={report.scores.universal}/><ScoreCard title="Selected adaptive path" score={report.scores.adaptive}/></div><p className="grading-muted">Compare different genres on the universal anchor only. Adaptive scores guide trade-offs within the same committed path; never select the larger score as a winner.</p>
   {report.strengths.length>0&&<section><h4>What’s working</h4><ul>{report.strengths.map((strength,index)=><li key={index}>{strength}</li>)}</ul></section>}
   {report.promises.length>0&&<section><h4>Traceable player promises</h4><ul>{report.promises.map((promise,index)=><li key={index}>{promise}</li>)}</ul></section>}
   <section><h4>Criterion feedback</h4>{!reportRubric&&<p className="grading-muted">Original rubric snapshot unavailable. Criterion IDs and saved feedback are shown without labels from the current rubric.</p>}<div className="grading-criteria">{report.criteria.map(criterion=>{const definition=reportRubric?.criteria.find(item=>item.id===criterion.id);return <article className="grading-criterion" key={criterion.id}><div className="grading-heading"><h5>{criterion.id}{definition&&` · ${definition.name}`}</h5><span className="grading-badge">{criterion.grade==='NE'?'NE · not evidenced':`${criterion.grade} / 4`}</span></div><p>{criterion.feedback}</p>{criterion.evidence.length?<details><summary>Source evidence · {criterion.evidence.length}</summary>{criterion.evidence.map((evidence,index)=><div className="grading-evidence" key={index}><code>{pathLabel(evidence.path)}</code><blockquote>{evidence.quote}</blockquote></div>)}</details>:<p className="grading-muted">No source evidence supplied.</p>}<p><strong>Improvement:</strong> {criterion.improvement}</p></article>;})}</div></section>
   <details className="grading-panel"><summary>Gates and non-additive diagnostics</summary><p>Gate statuses are static checks, not runtime verification. Diagnostics do not add extra points to the reported totals.</p><div className="grading-criteria">{report.gates.map(gate=><article key={gate.id}><h5>{gate.id} · {gate.status}</h5><p>{gate.explanation}</p></article>)}{Object.entries(diagnosticNames).map(([key,label])=>{const diagnostic=report.diagnostics[key as keyof typeof diagnosticNames];return <article key={key}><h5>{label} · {diagnostic.score==='NE'?'NE · not evidenced':`${numberLabel(diagnostic.score)} / 100`}</h5><p>{diagnostic.explanation}</p></article>;})}</div></details>
   {report.missingEvidence.length>0&&<section className="grading-warning"><h4>Missing evidence</h4><ul>{report.missingEvidence.map((missing,index)=><li key={index}>{missing}</li>)}</ul></section>}
   <section><h4>Prioritized fixes</h4><p>Suggestions create planning proposals only. Review and explicitly approve a Work Order in Planning; no fix is applied here.</p>{report.fixes.length===0&&<p>No fixes proposed in this report.</p>}{[...report.fixes].sort((first,second)=>({high:0,medium:1,low:2}[first.priority]-{high:0,medium:1,low:2}[second.priority])).map(fix=><article className="grading-criterion" key={fix.id}><div className="grading-heading"><h5>{fix.title}</h5><span className="grading-badge">{fix.priority} priority</span></div><p>{fix.why}</p><p className="grading-muted">Criteria: {fix.criterionIds.join(', ')||'General'}</p><ul>{fix.requirements.map((requirement,index)=><li key={index}>{requirement}</li>)}</ul><details><summary>Proposed scope{fix.wholeWorld?' · whole world':''}</summary>{fix.allowedPaths.map((allowed,index)=><p key={index}><code>{pathLabel(allowed)}</code></p>)}</details><button type="button" disabled={locked||!!project.draft||sourceStale||rubricStale} onClick={()=>void perform('Suggesting Work Order',async()=>{await onCommand({type:'gradingFixOrder',reportId:report.id,fixId:fix.id,id:crypto.randomUUID(),baseHash:sourceHash});setNotice('Work Order suggested. Review and approve it in Planning; no changes were applied.');onNavigate('plan');})}>Suggest Work Order</button></article>)}</section>
   <details className="grading-provenance"><summary>Snapshot provenance</summary><p>Report: <code>{report.id}</code> · Task: <code>{report.taskId}</code></p><p>Source hash: <code>{report.sourceHash}</code></p><p>Rubric hash: <code>{report.rubricHash}</code></p></details>
  </section>}
 </section>;
}
