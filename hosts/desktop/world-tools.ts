import type {Store} from './store';

export function dispatchWorldTool(store:Store,projectId:string,taskId:string,attempt:string,callId:string,name:string,args:any){
 const response=store.dispatch(projectId,{type:'taskTool',taskId,attempt,callId,name,args});
 if(!response.project)throw new Error('Tool project was not persisted.');
 const receipt=response.project.tasks.find(task=>task.id===taskId&&task.attempt===attempt)?.toolJournal?.find(entry=>entry.id===callId&&entry.attempt===attempt);
 if(!receipt)throw new Error('Tool receipt was not persisted.');
 if(receipt.state==='rejected')throw new Error(receipt.result.error);
 return receipt.result;
}
