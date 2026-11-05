import React,{useMemo,useState} from 'react';
import {compatibilityFieldUpdates} from '../../../packages/core/authoring';
import {label} from '../../../packages/core/document';
import {hash,type Project} from '../../../packages/core/project';

export function CompatibilityReview({project,command,onReview}:{project:Project;command:(command:any)=>Promise<any>;onReview:()=>void}){
 const preview=useMemo(()=>compatibilityFieldUpdates(project.activeSource),[project.activeSource]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function stage(){setBusy(true);setError('');try{await command({type:'compatibilityProposal',id:crypto.randomUUID(),baseHash:hash(project.activeSource)});onReview();}catch(failure){setError((failure as Error).message);}finally{setBusy(false);}}
 return <section><h3>Reviewed V37 field updates</h3><p>Rename supported legacy NPC and quest fields in already-V37 worlds. This is not a version migration. Values, unrelated fields and heroesVersion remain unchanged. Nothing uploads automatically.</p>
 {preview.blockers.map(issue=><p key={JSON.stringify(issue.path)} role="status">{label(issue.path)}: {issue.message}</p>)}
 {preview.changes.length>0?<ul>{preview.changes.map(change=><li key={JSON.stringify(change.path)}>{label(change.path)} → {label(change.destination)}</li>)}</ul>:<p>No supported field renames are available.</p>}
 {error&&<p role="alert">{error}</p>}<button disabled={busy||!!project.draft||!!preview.blockers.length||!preview.changes.length} onClick={()=>void stage()}>Prepare proposal for review</button></section>;
}
