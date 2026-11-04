import React from 'react';
import type {Task} from '../../../packages/core/project';

export function AgentActivity({task}:{task:Task}){
 const journal=task.toolJournal||[],evidence=task.completionEvidence;
 if(!journal.length&&!evidence&&!task.toolSummary&&!task.policy?.autoResume&&!task.policy?.allowDelegation&&!task.parentTaskId)return null;
 return <details className="report"><summary>Execution evidence · {journal.length||task.toolSummary?.calls||0} tool calls{evidence?' · '+evidence.state:''}</summary>
 <p>Local tool receipts and cached-schema checks only. This is not official Voyage validation or gameplay verification.</p>
 {task.parentTaskId&&<p>Read-only child review for task <code>{task.parentTaskId}</code>. Snapshot: <code>{task.delegation?.sourceHash}</code>. Findings are advisory, not approval or validation proof.</p>}
 {task.policy&&(task.policy.autoResume||task.policy.allowDelegation)&&<p>Approved permissions: {task.policy.allowDelegation?'up to two same-route read-only reviews; ':''}{task.policy.autoResume?'up to two checkpoint continuations after host restart.':''} Additional provider calls may incur charges.</p>}
 {!!task.resumes?.length&&<p>{task.resumes.length} of 2 checkpoint continuations used. Original scope and lifetime tool budget retained; provider sessions are not replayed.</p>}
 {task.resumeBlockedReason&&<p role="status">Checkpoint continuation paused: {task.resumeBlockedReason}</p>}
 {task.toolSummary&&<p>Older detailed receipts expired under the retention policy. {task.toolSummary.calls} calls, {task.toolSummary.rejected} rejected.</p>}
 {evidence&&<div><p>Schema coverage: {evidence.coverage} · V{evidence.schemaVersion??'unknown'} · Environment: {evidence.environment}. {evidence.errors.length} recorded errors, {evidence.warnings} warnings.</p><p>Source: <code>{evidence.sourceHash}</code></p><p>Schema: <code>{evidence.schemaHash}</code></p>{evidence.errors.map((issue,index)=><p key={index}>{JSON.stringify(issue.path)}: {issue.message}</p>)}</div>}
 {journal.length>20&&<p>Showing the most recent 20 receipts of {journal.length} retained calls.</p>}
 {journal.slice(-20).map(receipt=><details key={receipt.attempt+':'+receipt.id}><summary>{receipt.name} · {receipt.state} · {receipt.id}</summary><p>Attempt <code>{receipt.attempt}</code> · Source {receipt.beforeHash.slice(0,12)} → {receipt.afterHash.slice(0,12)}</p><pre>{JSON.stringify(receipt.result,null,2).slice(0,3000)}</pre></details>)}
 </details>;
}
