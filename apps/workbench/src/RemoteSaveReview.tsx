import React from 'react';
import type {Project} from '../../../packages/core/project';

export function RemoteSaveReview({project,busy=false,onReview}:{project:Project;busy?:boolean;onReview:()=>void}){
 const operation=project.remote.operations.find(entry=>entry.state==='UNKNOWN'&&entry.comparison?.total>0);
 if(!operation)return null;
 return <section className="connection-card" aria-label="Review Voyage save changes"><h3>Inspect what Voyage saved</h3><p>Voyage returned {operation.comparison.total} differences. These may include generated quest triggers, omitted empty fields or defaults, but real edits must not be ignored.</p><button disabled={busy||!!project.draft} onClick={onReview}>Review Voyage changes…</button><p className="muted">Reads the linked draft into Proposals, with every before/after difference available. Nothing is resent or published. Accept the complete snapshot only after review; reject it to keep your local world unchanged.</p></section>;
}
