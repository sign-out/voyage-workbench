import React,{useEffect,useState} from 'react';
import type {Project} from '../../../packages/core/project';
import {compatibilityIdentity,workspacePersistence,voyageProfile,coverRecommendation,releaseAdvisories,type ContractSnapshot} from '../../../packages/core/voyage-compatibility';
import {selectReferences,label} from '../../../packages/core/document';
import {request} from './host';

type Connection={environment:string;contract?:ContractSnapshot|null};
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
 const environment=project.remote.worldId?project.remote.environment||'production':connection?.environment||'alpha';
 const supported=environment==='alpha'||environment==='production',profile=supported?voyageProfile(environment):null;
 const identity=compatibilityIdentity(project.activeSource),matched=selectReferences(project.activeSource,references,{environment});
 const contract=connection?.contract?.environment===environment?connection.contract:null;
 const status=workspacePersistence(project,{dirty,saving,online});
 async function refresh(){setBusy(true);setError('');try{if(connection?.environment!==environment)throw new Error('Select the linked world’s environment in Connections first. Refreshing does not retarget a project.');onConnection?.(await request('refreshVoyageContract'));}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
 return <details className="compatibility-status"><summary aria-label={'Save and compatibility: '+status} title={status}><span className="compatibility-label-desktop">{status}</span><span className="compatibility-label-mobile">{saving?"Saving":dirty||project.draft?"Draft":"Local save"}</span></summary><section className="compatibility-panel" aria-label="Save and Voyage compatibility"><h3>Save &amp; compatibility</h3><p role="status">{status}</p><dl><dt>World target</dt><dd>{environment}{project.remote.worldId?' · '+project.remote.worldId:' · no remote world linked'}</dd><dt>Authored version</dt><dd>{identity.heroesVersion}</dd><dt>Compatibility revision</dt><dd>{identity.compatibilityRevision}</dd><dt>Engine build</dt><dd>Unknown — not exposed by the verified Creator API contract</dd><dt>Cached schema</dt><dd>{matched.length?matched.length+' matching sections · advisory, not official compatibility':'No unambiguous matching reference set'}</dd><dt>Official API documentation</dt><dd>{contract?contract.version+' · checked '+new Date(contract.checked).toLocaleString():'Not refreshed for this environment'}</dd></dl><p>Saved locally is not uploaded, published, or proof of current remote state. A matching schema or API version does not prove every Voyage engine can play these edits.</p>{profile&&<><p>Cover recommendation: {coverRecommendation(environment,contract).width} × {coverRecommendation(environment,contract).height}. Any positive cover dimensions remain allowed under the audited contract.</p><a href={profile.studioUrl} target="_blank" rel="noreferrer">Open this environment’s Studio for engine compatibility</a></>}{project.remote.worldId&&connection?.environment!==environment&&<p role="alert">Connections targets {connection?.environment||'an unknown environment'}. This project remains linked to {environment}; switch explicitly before remote actions.</p>}<button disabled={busy||!supported||!onConnection} onClick={()=>void refresh()}>{busy?'Checking official documentation…':'Refresh official API documentation'}</button><small>This makes public documentation GETs only; it does not validate, upgrade or save a world.</small>{error&&<p role="alert">{error} Previous cached documentation is retained.</p>}</section></details>;
}

export function ReleaseGuidance({project,stage='publish'}:{project:Project;stage?:'draft'|'publish'}){
 const [connection]=useVoyageConnection(project.id);
 const environment=project.remote.worldId?project.remote.environment||'production':connection?.environment||'';
 if(environment!=='alpha'&&environment!=='production')return <p className="muted">Release-specific guidance is unavailable until the target environment is known.</p>;
 const profile=voyageProfile(environment),issues=releaseAdvisories(project.activeSource,environment,stage);
 return <section className="connection-card release-guidance" aria-label="Voyage release guidance"><h3>Release-specific guidance · {environment}</h3>{profile.release?<><p>{profile.release.label}: item catalog {profile.release.itemCatalogCharacters.toLocaleString()} characters; item Media Content {profile.release.itemMediaCharacters.toLocaleString()} characters. Announcement-derived; upstream counting is unverified. These warnings never truncate data or certify publication.</p><ul>{issues.map((issue,index)=><li key={index}>{label(issue.path)}: {issue.message}</li>)}</ul></>:<p>No release-specific publish caps are verified for this environment. Official validation remains authoritative; alpha rules are not applied to production.</p>}<p>Artistic review is separate from safety moderation. An Unpublishable cover must be removed or replaced before publication; a passing art grade does not override Voyage moderation.</p></section>;
}
