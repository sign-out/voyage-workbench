import React,{useEffect,useState} from 'react';
import type {Project} from '../../../packages/core/project';
import {operationSnapshot,subscribeOperations,clearCompletedOperations} from './operation-progress';

export function OperationActivity({project}:{project:Project|null}){
 const [operations,setOperations]=useState(operationSnapshot),[now,setNow]=useState(Date.now());
 useEffect(()=>subscribeOperations(()=>setOperations(operationSnapshot())),[]);
 const tasks=project?.tasks.filter(task=>['PREPARED','RUNNING'].includes(task.state))||[];
 const active=operations.filter(operation=>operation.state==='running'),running=active.length+tasks.length;
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running]);
 if(!operations.length&&!tasks.length)return null;
 const elapsed=(started:number,finished?:number)=>Math.max(0,Math.floor(((finished||now)-started)/1000))+'s';
 return <details className="operation-activity"><summary aria-live="polite">{running?<><span className="operation-spinner" aria-hidden="true"/>{active[0]?.label||'Model working'} · {running} active</>:'Activity · latest results'}</summary><section className="operation-panel" aria-label="Work in progress and recent results"><h3>Activity</h3><p>Progress stays visible when you switch views. No automatic retries or invented completion percentages.</p>{tasks.map(task=><article key={task.id}><strong>{task.state==='PREPARED'?'Queued model work':'Model working'} · {task.route?.name||task.kind}</strong><small>{task.route?.model||'Configured model'} · {elapsed(task.preparedAt||task.created)}</small><p>{task.toolJournal?.at(-1)?.state==='pending'?'Running tool: '+task.toolJournal.at(-1)!.name:'Waiting for the model or its next tool result…'}</p><progress aria-label="Model work in progress"/></article>)}{operations.slice().reverse().map(operation=><article key={operation.id}><strong>{operation.label}</strong><small>{operation.state==='running'?'In progress':operation.state==='succeeded'?'Completed':'Needs attention'} · {elapsed(operation.started,operation.finished)}</small>{operation.state==='running'&&<progress aria-label={operation.label+' in progress'}/>} {operation.error&&<p>{operation.error} No retry was started automatically.</p>}</article>)}<button onClick={clearCompletedOperations}>Clear finished activity</button></section></details>;
}
