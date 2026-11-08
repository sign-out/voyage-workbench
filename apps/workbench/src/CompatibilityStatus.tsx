import React,{useEffect,useState} from 'react';
import type {Project} from '../../../packages/core/project';
import {compatibilityIdentity,workspacePersistence,voyageProfile,isVoyageEnvironment,coverRecommendation,releaseAdvisories,type ContractSnapshot,type WorldEngineStatus} from '../../../packages/core/voyage-compatibility';
import {selectReferences,label} from '../../../packages/core/document';
import {request} from './host';

type Connection={environment:string;voyage?:boolean;contract?:ContractSnapshot|null};
export function WorldEngineNotice({project,connection}:{project:Project;connection?:Connection|null}){
 const [result,setResult]=useState<{key:string;status?:WorldEngineStatus;error?:string}>(),[inspection,setInspection]=useState<{key:string;attempt:number}>();
 const identity=compatibilityIdentity(project.activeSource),key=JSON.stringify([project.id,project.remote.worldId,project.remote.etag,connection?.environment,connection?.voyage,identity.heroesVersion,identity.compatibilityRevision]);
 const enabled=!!project.remote.worldId&&!!connection?.voyage&&isVoyageEnvironment(connection.environment);
 useEffect(()=>{setInspection(undefined);setResult(undefined);},[key]);
 useEffect(()=>{if(!enabled||inspection?.key!==key)return;let active=true;void request('worldEngine',{id:project.id,environment:connection?.environment}).then(status=>{if(active)setResult({key,status});}).catch(reason=>{if(active)setResult({key,error:(reason as Error).message});});return()=>{active=false;};},[inspection,enabled]);
 if(!enabled)return null;
 const current=result?.key===key?result:null,profile=voyageProfile(connection!.environment);
 const inspect=()=>{setResult(undefined);setInspection(previous=>({key,attempt:(previous?.attempt||0)+1}));};
 if(inspection?.key!==key)return <section className="feature-status" aria-label="World engine compatibility"><button onClick={inspect}>Check world engine on {connection!.environment}</button><small>Opening an older world can upgrade it automatically on Voyage Production. This check runs only when requested, not when you open a local project or switch connections.</small></section>;
 if(!current)return <section className="feature-status" role="status" aria-label="World engine check">Checking world engine on {connection!.environment}…</section>;
 if(!current.status?.warning&&!current.error)return <section className="feature-status" role="status" aria-label="World engine compatibility"><p>No newer engine version was reported by this check. This is not proof of write permission or compatibility where metadata is missing.</p><button onClick={inspect}>Check engine again</button></section>;
 return <section className="feature-status warning" role="status" aria-label="World engine compatibility"><strong>{current.error?'World engine compatibility not checked':'Newer world engine'}</strong><p>{current.error||current.status!.warning}</p><a href={profile.studioUrl} target="_blank" rel="noreferrer">Open selected Studio for engine compatibility</a><button onClick={inspect}>Check engine again</button><small>Worlds are not tied to Alpha, Beta or Production. This check never edits local world data or approves an upgrade; Voyage may convert older drafts when opened.</small></section>;
}
export function useVoyageConnection(projectId:string){
 const [connection,setConnection]=useState<Connection|null>(null);
 useEffect(()=>{
  let active=true,revision=0;setConnection(null);
  const update=()=>{const current=++revision;void request('connection').then(result=>{if(active&&current===revision)setConnection(result);}).catch(()=>{});};
  update();window.addEventListener?.('voyage-connection-changed',update);
  return()=>{active=false;window.removeEventListener?.('voyage-connection-changed',update);};
 },[projectId]);
 return [connection,setConnection] as const;
}
export function CompatibilityStatus({project,connection,references=[],dirty=false,saving=false,onConnection}:{project:Project;connection?:Connection|null;references?:any[];dirty?:boolean;saving?:boolean;onConnection?:(connection:any)=>void}){
 const [online,setOnline]=useState(typeof navigator==='undefined'||navigator.onLine!==false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const update=()=>setOnline(navigator.onLine!==false);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 const environment=connection?.environment||project.remote.environment||'alpha';
 const supported=isVoyageEnvironment(environment),profile=supported?voyageProfile(environment):null;
 const identity=compatibilityIdentity(project.activeSource),matched=selectReferences(project.activeSource,references,{environment});
 const contract=connection?.contract?.environment===environment?connection.contract:null;
 const status=workspacePersistence(project,{dirty,saving,online});
 async function refresh(){setBusy(true);setError('');try{onConnection?.(await request('refreshVoyageContract'));}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
 return <details className="compatibility-status"><summary aria-label={'Save and compatibility: '+status} title={status}><span className="compatibility-label-desktop">{status}</span><span className="compatibility-label-mobile">{saving?"Saving":dirty||project.draft?"Draft":"Local save"}</span></summary><section className="compatibility-panel" aria-label="Save and Voyage compatibility"><h3>Save &amp; compatibility</h3><WorldEngineNotice project={project} connection={connection}/><p role="status">{status}</p><dl><dt>World target</dt><dd>{environment}{project.remote.worldId?' · '+project.remote.worldId:' · no remote world linked'}</dd><dt>Authored version</dt><dd>{identity.heroesVersion}</dd><dt>Compatibility revision</dt><dd>{identity.compatibilityRevision}</dd><dt>Engine build</dt><dd>Unknown — not exposed by the verified Creator API contract</dd><dt>Cached schema</dt><dd>{matched.length?matched.length+' matching sections · advisory, not official compatibility':'No unambiguous matching reference set'}</dd><dt>Official API documentation</dt><dd>{contract?contract.version+' · checked '+new Date(contract.checked).toLocaleString():'Not refreshed for this environment'}</dd></dl><p>Saved locally is not uploaded, published, or proof of current remote state. A matching schema or API version does not prove every Voyage engine can play these edits.</p>{profile&&<><p>Cover recommendation: {coverRecommendation(environment,contract).width} × {coverRecommendation(environment,contract).height}. Any positive cover dimensions remain allowed under the audited contract.</p><a href={profile.studioUrl} target="_blank" rel="noreferrer">Open this environment’s Studio for engine compatibility</a></>}<p>World identity is shared across connections. New remote actions use {environment}; previous sync hosts are history, not world restrictions.</p><button disabled={busy||!supported||!onConnection} onClick={()=>void refresh()}>{busy?'Checking official documentation…':'Refresh official API documentation'}</button><small>This makes public documentation GETs only; it does not validate, upgrade or save a world.</small>{error&&<p role="alert">{error} Previous cached documentation is retained.</p>}</section></details>;
}

export function ReleaseGuidance({project,stage='publish'}:{project:Project;stage?:'draft'|'publish'}){
 const [connection]=useVoyageConnection(project.id);
 const environment=connection?.environment||project.remote.environment||'';
 if(!isVoyageEnvironment(environment))return <p className="muted">Release-specific guidance is unavailable until the target environment is known.</p>;
 const profile=voyageProfile(environment),issues=releaseAdvisories(project.activeSource,environment,stage);
 return <section className="connection-card release-guidance" aria-label="Voyage release guidance"><h3>Release-specific guidance · {environment}</h3>{profile.release?<><p>{profile.release.label}: item catalog {profile.release.itemCatalogCharacters.toLocaleString()} characters; item Media Content {profile.release.itemMediaCharacters.toLocaleString()} characters. Announcement-derived; upstream counting is unverified. These warnings never truncate data or certify publication.</p><ul>{issues.map((issue,index)=><li key={index}>{label(issue.path)}: {issue.message}</li>)}</ul></>:<p>No release-specific publish caps are verified for this environment. Official validation remains authoritative; rules are not borrowed from another environment.</p>}<p>Artistic review is separate from safety moderation. An Unpublishable cover must be removed or replaced before publication; a passing art grade does not override Voyage moderation.</p></section>;
}
