import React,{useEffect,useMemo,useRef,useState} from 'react';
import {hash,type Project} from '../../../packages/core/project';
import {creationArtifactSpecs,creationReadiness,creationVisualHash,creationVisualFindingsHash,creationUnresolvedVisualFindings,worldCreationRubric} from '../../../packages/core/world-creation';
import {creationMapSvg} from '../../../packages/core/creation-map';
import {defaultCoverGrader} from '../../../packages/core/covers';
import {resolveRoute,type TaskRoute} from '../../../packages/core/providers';
import {publicationEdit} from '../../../packages/core/studio';
import {put,worldAuthoringDefaults} from '../../../packages/core/features';
import {useWorldField} from './use-world-field';
import {usePublicationDetails} from './use-publication-details';
import {statePath,parse} from '../../../packages/core/document';
import {request} from './host';
import {feature,type Asset} from './features-api';
import {coverEvidence} from './cover-evidence';
import {AgentRunOptions,type RunOptions} from './AgentRunOptions';
import {generateCreationAssets,renderCreationRegion,uploadCreationAssets,creationPackage,creationDetails} from './creation-execution';
import {saveAsset} from './features-api';
import {restoreCreationArchive} from './creation-transfer';
import {creationVisualRoute,creationVisualBatchSize} from '../../../packages/core/creation-visual';
import {reviewCreationVisuals,creationVisualPreview} from './creation-visual';

type Props={project:Project;references:any[];command:(command:any)=>Promise<any>;receive:(result:any)=>void;onReview:()=>void;onPublish:()=>void;onNew:()=>Promise<void>;onRestore?:(project:Project)=>Promise<void>;disabled?:boolean};
export function WorldCreationWorkspace({project,references,command,receive,onReview,onPublish,onNew,onRestore,disabled=false}:Props){
 const workspace=project.creation,publication=usePublicationDetails(project),worldDefaults=useMemo(()=>worldAuthoringDefaults(project,publication.source),[project.activeSource,project.name,project.creation?.design.artDirection,publication.source]);
 const [targetEnvironment,setTargetEnvironment]=useState(workspace?.targetEnvironment||project.remote.environment||'alpha');
 const [brief,setBrief]=useWorldField(workspace?workspace.brief:worldDefaults.premise,project.id),[documents,setDocuments]=useState<{id:string;name:string;text:string}[]>(workspace?.documents.map(({id,name,text})=>({id,name,text}))||[]),[profile,setProfile]=useState(workspace?.profile||'universal');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[allowImages,setAllowImages]=useState(false),[maximumImages,setMaximumImages]=useState(8),[route,setRoute]=useState<TaskRoute>(),[visualReport,setVisualReport]=useState('');
 const [runOptions,setRunOptions]=useState<RunOptions>({autoResume:false,allowDelegation:false}),[capabilities,setCapabilities]=useState({checkpointResume:false,delegation:false});
 const [assets,setAssets]=useState<Record<string,Asset>>({});
 const [allVisualsInspected,setAllVisualsInspected]=useState(false);
 const [resolveVisualFindings,setResolveVisualFindings]=useState(false),[visualResolution,setVisualResolution]=useState('');
 const [reviewRunning,setReviewRunning]=useState(false),stopVisualReview=useRef(false);
 const automatic=useRef<{taskId:string;route?:TaskRoute;maximumImages:number}|null>(null),assetBusy=useRef(false),stopAssets=useRef(false),mounted=useRef(true),latest=useRef(project);latest.current=project;
 const running=project.tasks.find(task=>!task.parentTaskId&&['PREPARED','RUNNING'].includes(task.state));
 const report=useMemo(()=>{if(!workspace)return null;try{return creationReadiness(workspace,project.activeSource,references,hash);}catch(reason){return {error:(reason as Error).message};}},[workspace,project.activeSource,references]);
 const specs=useMemo(()=>{if(!workspace)return [];try{return creationArtifactSpecs(workspace,project.activeSource,hash);}catch{return [];}},[workspace,project.activeSource]);
 const readiness=report&&'state' in report?report:null;
 const visualInputHash=workspace?creationVisualHash(workspace,project.activeSource,hash):'';
 const visualFindingsHash=workspace?creationVisualFindingsHash(workspace,project.activeSource,hash):'';
 const unresolvedVisuals=workspace?creationUnresolvedVisualFindings(workspace,project.activeSource,hash):[];
 const hasVisualIssues=unresolvedVisuals.length>0||workspace?.visualReview?.inputHash===visualInputHash&&!!workspace.visualReview.outcome&&workspace.visualReview.outcome!=='pass';
 useEffect(()=>{setAllVisualsInspected(false);},[visualInputHash]);
 useEffect(()=>{setResolveVisualFindings(false);setVisualResolution('');},[visualFindingsHash]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopAssets.current=true;automatic.current=null;};},[]);
 useEffect(()=>{let active=true;void request('providerSettings').then(result=>{try{if(active)setRoute(resolveRoute(result.settings,'artwork'));}catch{if(active)setRoute(undefined);}}).catch(()=>{});void request('orchestrationCapabilities').then(result=>{if(active)setCapabilities(result);}).catch(()=>{});return()=>{active=false;};},[project.id,busy]);
 useEffect(()=>{let active=true;const ids=workspace?.jobs.filter(job=>job.state==='ready'&&job.assetId).map(job=>job.assetId!).slice(0,80)||[];void Promise.all(ids.map(id=>feature<Asset|null>('asset:'+id,null))).then(items=>{if(active)setAssets(Object.fromEntries(items.filter((item):item is Asset=>!!item).map(item=>[item.id,item])));}).catch(reason=>{if(active)setError((reason as Error).message);});return()=>{active=false;};},[workspace?.jobs]);
 async function act(operation:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await operation();}catch(reason){if(mounted.current)setError((reason as Error).message);}finally{if(mounted.current)setBusy(false);}}
 async function importSources(files:FileList|null){
  if(!files)return;const next=documents.slice();
  for(const file of Array.from(files)){if(file.size>4*1024*1024)throw new Error('Each source file must be at most 4 MiB.');next.push({id:'source-'+crypto.randomUUID(),name:file.name,text:await file.text()});}
  if(next.length>20||next.reduce((total,document)=>total+document.text.length,0)>4*1024*1024)throw new Error('Use at most twenty documents and four million characters total.');setDocuments(next);
 }
 async function saveBrief(){
  if(workspace&&!window.confirm('Replace this creation brief and reset its design, jobs and assessment? Existing world JSON and library assets are preserved.'))return;
  await command({type:'configureCreation',baseHash:hash(project.activeSource),expectedRevision:workspace?.revision,workspace:{id:crypto.randomUUID(),brief,documents,profile,targetEnvironment}});
  setNotice('Sources saved locally. No provider request was sent.');
 }
 async function runAssets(approval:{route?:TaskRoute;maximumImages:number;acknowledgeRetry?:boolean}){
  if(assetBusy.current)throw new Error('An asset batch is already active.');assetBusy.current=true;stopAssets.current=false;
  try{
   const result=await generateCreationAssets(project.id,approval,{invoke:async(method,payload)=>{if(method==='imageGenerate'&&stopAssets.current)throw new Error('Batch stopped before another image request.');return request(method,payload);},saveAsset,renderMap:async(...args)=>{if(stopAssets.current)throw new Error('Map batch stopped.');return renderCreationRegion(...args);},id:()=>crypto.randomUUID(),onProject:receive});
   if(mounted.current)setNotice(`Local asset batch finished; ${result.imageRequests} image requests sent. Nothing uploaded or published.`);
  }finally{assetBusy.current=false;}
 }
 async function build(reviewOnly=false){
  if(!workspace)return;
  if(!window.confirm(reviewOnly?'Run the assistant to inspect the current package and repair rubric defects? World edits remain subject to the normal proposal/apply checks.':'Approve whole-world construction from these sources? This can change all authored world content and incur provider charges. Maps are rendered locally. Image generation is limited by the separate permission below. Nothing will be uploaded or published.'))return;
  const approved=await command({type:'approveCreation',baseHash:hash(project.activeSource),expectedRevision:workspace.revision});
  const prompt=reviewOnly?'Inspect the existing creation workspace, every rubric requirement, world, maps, artwork status and any visualReview. Record a source-evidenced review; repair concrete content defects. Missing visual evidence remains NE. Do not inflate grades or rebuild successful content.':'Complete the approved source-to-world creation work order. Start with creation_read(summary), then help, and page through every attached source. Build the substantial world, map blueprints, artwork briefs and publication details. Save incrementally. Do not stop at a plan or scaffold. Finish with host-owned readiness and identify any work reserved for the asset stage.';
  const result=await request('startAgent',{id:project.id,kind:'work',prompt,...runOptions});receive(result);
  const task=result.project?.tasks.find((task:any)=>task.creationId===approved.project.creation.id&&['PREPARED','RUNNING'].includes(task.state));
  if(task&&!reviewOnly)automatic.current={taskId:task.id,route:allowImages?route:undefined,maximumImages:allowImages?maximumImages:0};
  setRunOptions({autoResume:false,allowDelegation:false});setNotice('The assistant is building the world. Apply its proposal if local automatic application needs review.');
 }
 useEffect(()=>{
  const approval=automatic.current;if(!approval||busy||assetBusy.current||running||disabled||project.draft)return;
  if(project.tasks.find(task=>!task.parentTaskId)?.id!==approval.taskId){automatic.current=null;setNotice('A newer task superseded automatic asset preparation. Review and approve a fresh batch.');return;}
  const task=project.tasks.find(task=>task.id===approval.taskId);if(!task)return;
  if(['FAILED','CANCELED'].includes(task.state)){automatic.current=null;return;}
  if(task.state==='INTERRUPTED'||project.candidates.some(candidate=>candidate.id===task.id))return;
  if(!['APPLIED','COMPLETED','PROPOSAL_READY'].includes(task.state))return;
  if(task.completionEvidence?.sourceHash!==hash(project.activeSource)){automatic.current=null;setNotice('The applied world differs from the completed assistant snapshot. Review and approve a fresh asset batch.');return;}
  automatic.current=null;void act(()=>runAssets(approval));
 },[project.tasks,project.candidates,project.activeSource,project.draft,busy,running,disabled]);
 async function publishDetails(){
  const current=latest.current,details=creationDetails(current),base=statePath(parse(current.activeSource));
  for(const [key,value] of Object.entries(details))publicationEdit('{"world":{"title":"Local","initialGameState":{}}}',key,JSON.stringify(value));
  if(base.length){let source=current.activeSource;const parent=base.slice(0,-1);for(const [key,value] of Object.entries(details))source=put(source,parent,key,JSON.stringify(value));await command({type:'stage',id:crypto.randomUUID(),title:'Creation publication details',source,kind:'publication'});onReview();}
  else {const key='creation-details:'+current.id,previous=await request('featureGet',{key});let merged=previous?JSON.parse(JSON.parse(previous)):{};merged={...merged,...details};await request('featureSet',{key,expected:previous,value:JSON.stringify(JSON.stringify(merged))});onPublish();}
 }
 async function reviewAllVisuals(){
  const current=latest.current;if(!current.creation)return;
  const selected=creationVisualRoute((await request('providerSettings')).settings),inputHash=creationVisualHash(current.creation,current.activeSource,hash),progress=current.creation.visualProgress;
  const saved=progress?.inputHash===inputHash&&progress.routeHash===hash(JSON.stringify(selected))?new Set(progress.reports.flatMap(report=>report.assets.map(asset=>asset.id))):new Set<string>();
  const count=creationArtifactSpecs(current.creation,current.activeSource,hash).filter(spec=>!saved.has(spec.id)).length,maximumBatches=Math.ceil(count/creationVisualBatchSize);
  if(!window.confirm(`Send saved image previews, artifact briefs and bounded research excerpts to ${selected.name} / ${selected.model||'provider default'} for up to ${maximumBatches} visual-review requests? Charges or account usage may apply. ${saved.size} saved findings can be reused. Lost responses are not retried automatically. Nothing will be generated, uploaded to Voyage or published.`))return;
  stopVisualReview.current=false;setReviewRunning(true);
  try{const result=await reviewCreationVisuals(current.id,{route:selected,maximumBatches},{invoke:request,loadAsset:id=>feature<Asset|null>('asset:'+id,null),preview:creationVisualPreview,onProject:receive,shouldStop:()=>stopVisualReview.current||!mounted.current});
   if(mounted.current){setVisualReport(result.report);setAllVisualsInspected(false);setNotice(`Whole-package model visual review: ${result.outcome}. ${result.requests} new requests. Findings are saved; rubric review and any required repairs remain separate.`);}
  }finally{if(mounted.current)setReviewRunning(false);}
 }
 async function gradeCover(){
  if(!workspace)return;const cover=specs.find(spec=>spec.destinationId==='creation-cover');
  const job=workspace.jobs.find(job=>job.id===cover?.id&&job.specHash===cover?.specHash&&job.state==='ready'),asset=job?.assetId?await feature<Asset|null>('asset:'+job.assetId,null):null;if(!asset)throw new Error('Generate and save a cover first.');
  const settings=(await request('providerSettings')).settings,grader=defaultCoverGrader(settings),images=await coverEvidence(asset.dataUrl,workspace.publication.title);
  const result=await request('coverGrade',{...grader,brief:{title:workspace.publication.title,premise:workspace.publication.blurb,direction:workspace.design.artDirection,original:false},images});
  setVisualReport(JSON.stringify({scope:'Cover crops only; this does not inspect all secondary artwork or establish G20 by itself.',assetHash:job!.assetHash,report:result.report},null,2));setNotice('Cover diagnostic completed. Inspect the remaining artwork before recording a whole-package visual review.');
 }
 const locked=busy||disabled||!!running||!!project.draft||workspace?.jobs.some(job=>job.state==='running');
 return <div className="content-page world-creation">
  <div className="page-heading"><div><div className="eyebrow">SOURCE → FINISHED WORLD</div><h2>Create a Voyage world</h2><p>Research, playable content, planned and rendered maps, artwork, cover and publishing copy in one saved workspace.</p></div><button disabled={busy||!!running} onClick={()=>void act(onNew)}>New V37 creation project</button></div>
  <p>Construction is local and reviewable. Generation may incur charges. Uploading, creating remote drafts and publishing remain separate approvals. New V37 seeds come from the bundled community schema—not a migration of your existing world.</p>
  <label>Restore an exported creation package into a new local project<input type="file" accept=".json,application/json" disabled={!!locked} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void act(async()=>{if(file.size>128*1024*1024)throw new Error('Creation archives must be at most 128 MiB.');if(!window.confirm('Restore source documents, world, plans and local artwork into a new unlinked project? Prior approvals and reviews will not be trusted. Nothing will be sent to Voyage.'))return;const restored=await restoreCreationArchive(await file.text());if(onRestore)await onRestore(restored.project);else setNotice('Restored creation project '+restored.project.name+'. Open it from the project list; source coverage and reviews require fresh assessment.');});}}/></label>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <section className="connection-card"><h3>1. Creative request and source material</h3>
   <label>What world should the assistant create?<textarea rows={5} value={brief} disabled={!!locked} onChange={event=>setBrief(event.target.value)} placeholder="Create a Voyage world based on … Faithfully adapt the attached research, including characters, geography, culture, tone and appearance. Plan and create its maps, cover and publishing blurb."/></label>
   <label>Markdown or text research<input type="file" multiple accept=".md,.markdown,.txt,text/plain,text/markdown" disabled={!!locked} onChange={event=>{const files=event.target.files;void act(()=>importSources(files));event.target.value='';}}/></label>
   <ul>{documents.map(document=><li key={document.id}>{document.name} · {document.text.length.toLocaleString()} characters <button disabled={!!locked} onClick={()=>setDocuments(documents.filter(item=>item.id!==document.id))}>Remove</button></li>)}</ul>
   <label>Artwork target environment<select aria-label="Creation artwork environment" value={targetEnvironment} disabled={!!locked} onChange={event=>setTargetEnvironment(event.target.value as 'alpha'|'production')}><option value="alpha">Alpha · widescreen cover recommendation</option><option value="production">Production · production cover recommendation</option></select></label><p className="muted">Pins composition guidance for new artifact jobs, not an API connection or engine upgrade. Existing approved briefs are never rewritten by a connection change.</p>{workspace&&!workspace.targetEnvironment&&<p className="feature-status">This legacy plan retains its original cover composition. Replace the brief explicitly to adopt the selected artwork target.</p>}
   <label>Precommitted rubric path<select value={profile} disabled={!!locked} onChange={event=>setProfile(event.target.value)}><option value="universal">Universal</option>{Object.entries(worldCreationRubric.adaptive_paths.profiles).map(([id,value]:[string,any])=><option value={id} key={id}>{value.name}</option>)}</select></label>
   <button disabled={!!locked||!brief.trim()||!documents.length} onClick={()=>void act(saveBrief)}>{workspace?'Replace brief and reset creation plan':'Save source-to-world brief'}</button>
  </section>
  {workspace&&<>
   <section className="connection-card"><h3>2. Build and prepare the complete world</h3><p>The assistant reads the sources and builds through shared, validated world tools. Its geographic blueprints become continuous, editable cartographic region maps—not unrelated image prompts.</p>
    <AgentRunOptions value={runOptions} onChange={setRunOptions} capabilities={capabilities}/>
    <label><input type="checkbox" checked={allowImages} disabled={!!locked||!route} onChange={event=>setAllowImages(event.target.checked)}/>After the world is applied, also generate approved artwork briefs using {route?`${route.name} / ${route.model||'provider default'}`:'an Artwork provider (not configured)'}. Extra charges may apply.</label>
    <label>Maximum image requests in this batch<input type="number" min={0} max={100} value={maximumImages} disabled={!!locked||!allowImages} onChange={event=>setMaximumImages(Number(event.target.value))}/></label>
    <div className="button-row"><button className="primary" disabled={!!locked} onClick={()=>void act(()=>build())}>Build world, maps and publishing package</button><button disabled={busy||!running} onClick={()=>void act(async()=>{automatic.current=null;receive(await request('stopAgent',{id:project.id,taskId:running!.id}));})}>Stop assistant</button><button onClick={onReview}>Review world proposals</button></div>
    {running&&<p role="status">Assistant {running.state.toLowerCase()}. Sources and completed tool work are saved with the project.</p>}
    <p>Foreground automatic asset preparation stops when this project closes. Saved jobs remain available; uncertain provider requests are never automatically repeated.</p>
   </section>
   <section className="connection-card"><h3>3. Maps and artwork</h3><p>{specs.filter(spec=>spec.kind==='map').length} planned region maps · {specs.filter(spec=>spec.kind==='image').length} image briefs. Map rendering uses no image provider. Every requested asset remains a completion obligation.</p>
    <div className="button-row"><button disabled={!!locked||!specs.length} onClick={()=>void act(()=>runAssets({maximumImages:0}))}>Render missing maps locally</button><button disabled={!!locked||!allowImages||!route} onClick={()=>{if(window.confirm(`Generate up to ${maximumImages} images on the displayed Artwork route, plus missing local maps? Provider charges may apply.`))void act(()=>runAssets({route,maximumImages}));}}>Generate approved asset batch</button><button disabled={!assetBusy.current} onClick={()=>{stopAssets.current=true;setNotice('Stopping after the current request. Its result will be preserved.');}}>Stop after current asset</button><button disabled={!!locked||!workspace.jobs.some(job=>['uncertain','failed'].includes(job.state))} onClick={()=>{if(window.confirm('The provider may already have completed failed or uncertain requests. Check the asset library first. Explicitly retry these requests, accepting possible duplicate charges?'))void act(()=>runAssets({route:allowImages?route:undefined,maximumImages:allowImages?maximumImages:0,acknowledgeRetry:true}));}}>Explicitly retry reviewed failures</button></div>
    {workspace.jobs.some(job=>job.state==='running')&&!assetBusy.current&&<button disabled={busy} onClick={()=>{if(window.confirm('Only recover jobs if no other window or worker is still executing them. Mark recorded running jobs uncertain without sending another request?'))void act(async()=>{await command({type:'creationRecoverJobs'});});}}>Recover interrupted asset jobs</button>}
    {workspace.maps.map(map=><details key={map.id}><summary>Geographic blueprint · {map.id} · {map.columns} × {map.rows} regions</summary><img style={{maxWidth:'100%',maxHeight:500}} src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(creationMapSvg(map))} alt={'Planned geography for '+map.realm}/></details>)}
    <ul>{specs.map(spec=>{const job=workspace.jobs.find(job=>job.id===spec.id&&job.specHash===spec.specHash),asset=job?.assetId?assets[job.assetId]:undefined;return <li key={spec.id}><strong>{spec.label}</strong> · {job?.state||'planned'}{job?.url?' · uploaded':''}{job?.error&&<p>{job.error}</p>}{asset&&<details><summary>Inspect saved asset</summary><img style={{maxWidth:'100%',maxHeight:400}} src={asset.dataUrl} alt={spec.label}/></details>}</li>;})}</ul>
   </section>
   <section className="connection-card"><h3>4. Source fidelity and rubric review</h3><p>Rubric v1.6.2: 85/100 plus section floors and all mandatory gates. Missing evidence blocks readiness. This is a static assessment, not playtesting, official acceptance or predicted popularity.</p>
    <details><summary>Canon, assumptions and source evidence</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(workspace.design,null,2)}</pre></details>
    <details><summary>Lock approved canon decisions</summary>{workspace.design.decisions.map(decision=><label key={decision.id}><input type="checkbox" checked={decision.locked===true} disabled={!!locked} onChange={event=>void act(async()=>{await command({type:'creationSetLock',baseHash:hash(project.activeSource),expectedRevision:workspace.revision,id:decision.id,locked:event.target.checked});})}/>{decision.kind}: {decision.text}</label>)}</details>
    <details><summary>Lock approved map features</summary>{workspace.maps.map(map=><fieldset key={map.id}><legend>{map.id}</legend>{map.features.map(feature=><label key={feature.id}><input type="checkbox" checked={feature.locked===true} disabled={!!locked} onChange={event=>void act(async()=>{await command({type:'creationSetLock',baseHash:hash(project.activeSource),expectedRevision:workspace.revision,mapId:map.id,id:feature.id,locked:event.target.checked});})}/>{feature.label||feature.id} · {feature.kind}</label>)}</fieldset>)}</details>
    <div className="button-row"><button disabled={!!locked||!specs.length||!readiness||readiness.pending.length>0} onClick={()=>void act(reviewAllVisuals)}>Review every image with AI</button><button disabled={!!locked} onClick={()=>void act(gradeCover)}>Run paid cover diagnostic</button></div>
    <p>AI visual review is opt-in and can consume provider/account usage. It inspects up to four 768px image previews per request, saves completed findings, and preserves defects and uncertainties. It does not generate replacements or certify canon fidelity.</p>
    {reviewRunning&&<button onClick={()=>{stopVisualReview.current=true;setNotice('Stopping after the current review batch. Completed findings will be preserved.');}}>Stop after current visual-review batch</button>}
    {workspace.visualProgress&&<details><summary>Saved per-image visual findings and repair instructions</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(workspace.visualProgress,null,2)}</pre></details>}
    <label>Whole-package visual inspection report<textarea rows={5} value={visualReport} onChange={event=>setVisualReport(event.target.value)} placeholder="Inspect the actual cover, maps and other required artwork. Record source fidelity, geographic consistency, visual identity, cropping defects and remaining uncertainties. A cover-only diagnostic is insufficient."/></label>
    <label><input type="checkbox" checked={allVisualsInspected} onChange={event=>setAllVisualsInspected(event.target.checked)}/>I inspected the actual cover, every required map and the other required images—not only their prompts or a cover diagnostic.</label>
    {hasVisualIssues&&<fieldset><legend>Unresolved visual findings remain blocking</legend><p>Recording another report does not clear model findings. Repair the actual inputs and reassess, or explicitly document why the current findings are resolved or do not apply.</p><label><input type="checkbox" checked={resolveVisualFindings} onChange={event=>setResolveVisualFindings(event.target.checked)}/>I explicitly resolve the current visual findings after inspecting the actual images.</label><label>Resolution rationale (at least 20 characters)<textarea rows={3} value={visualResolution} disabled={!resolveVisualFindings} onChange={event=>setVisualResolution(event.target.value)}/></label></fieldset>}
    <button disabled={!!locked||!allVisualsInspected||!visualReport.trim()||!readiness||readiness.pending.length>0||resolveVisualFindings&&visualResolution.trim().length<20} onClick={()=>void act(async()=>{await command({type:'creationVisualReview',scope:'all-required-assets',inputHash:creationVisualHash(workspace,project.activeSource,hash),report:visualReport,...(hasVisualIssues&&resolveVisualFindings?{resolveFindings:true,findingsHash:visualFindingsHash,resolution:visualResolution}:{})});setAllVisualsInspected(false);setResolveVisualFindings(false);setNotice('Visual evidence recorded for this exact package. Unresolved findings remain blocking unless explicitly resolved; rubric gates require a fresh evidence-backed assessment.');})}>Record my visual inspection</button>
    <button disabled={!!locked} onClick={()=>void act(()=>build(true))}>Have assistant review and repair rubric defects</button>
    {readiness&&<><p><strong>{readiness.state}</strong> · source-only rubric interval {readiness.score.lower}–{readiness.score.upper}/100</p><ul>{readiness.blockers.slice(0,80).map((message,index)=><li key={index}>{message}</li>)}</ul><details><summary>Gate evidence, entity census and exact defects</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(readiness,null,2)}</pre></details></>}
    {report&&'error' in report&&<p role="alert">Assessment unavailable: {report.error}</p>}
   </section>
   <section className="connection-card"><h3>5. Assemble and deliver</h3><h4>{workspace.publication.title||'Title not written yet'}</h4><p>{workspace.publication.blurb||'Blurb not written yet.'}</p>
    <div className="button-row"><button disabled={!!locked||!project.remote.worldId} onClick={()=>{if(window.confirm('Upload and moderate completed creation assets for the linked Voyage draft, and assign approved URLs locally? This uses remote upload operations but does not save or publish the world.'))void act(()=>uploadCreationAssets(project.id,receive));}}>Upload and assign completed assets</button><button disabled={!!locked||!workspace.publication.title} onClick={()=>void act(publishDetails)}>Prepare title, blurb and cover in Publish</button><button disabled={!!locked} onClick={()=>void act(async()=>{await request('export',{source:project.activeSource,name:project.name+'-world.json'});})}>Export world JSON</button><button disabled={!!locked} onClick={()=>void act(async()=>{const bundle=await creationPackage(project,references);await request('export',{source:JSON.stringify(bundle),name:project.name+'-creation-package.json'});})}>Export package with local artwork and report</button><button onClick={onPublish}>Open Publish for draft creation and final approval</button></div>
    <p>Exports can contain unfinished work; the report preserves all blockers. Nothing here publishes automatically. The package archive contains source documents and local artwork for your own project recovery.</p>
   </section>
  </>}
 </div>;
}
