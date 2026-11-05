import * as doc from './document';
import type {Project,Task,ToolReceipt} from './project';
import {creationBriefHash} from './world-creation';

export const orchestrationLimits={resumes:2,children:2,summaryCharacters:4000};
export const toolJournalLimits={calls:256,resultCharacters:128*1024,totalCharacters:512*1024,retainedTasks:10};
export interface ToolCapabilities {delegation?:boolean;readOnly?:boolean;grading?:boolean;fieldFill?:boolean}
export interface TaskPolicy {autoResume:boolean;allowDelegation:boolean;routeHash:string;hostPlatform:string}
export interface ResumeReceipt {previousAttempt:string;attempt:string;sourceHash:string;created:number;reply:string}
export interface Delegation {parentAttempt:string;callId:string;paths:doc.Path[];sourceHash:string}
export function orchestrationCapabilities(platform:string,protocol=''){
 const known=['codex','openai','openai-responses','anthropic','gemini','claude-code','cursor','gemini-cli','opencode'].includes(protocol);
 const android=['codex','openai','openai-responses','anthropic','gemini','claude-code','cursor'].includes(protocol);
 return {checkpointResume:platform==='desktop'&&known||platform==='android'&&android,delegation:platform==='desktop'&&known,providerSessionResume:false};
}
export function taskPolicy(platform:string,route:any,input:any,hasher:(source:string)=>string):TaskPolicy {
 for(const key of ['autoResume','allowDelegation'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new Error('Choose explicit boolean orchestration permissions.');
 const capabilities=orchestrationCapabilities(platform,route?.protocol);
 if(input.autoResume&&!capabilities.checkpointResume||input.allowDelegation&&!capabilities.delegation)throw new Error('Requested orchestration is unavailable on this host/provider. No fallback was used.');
 if((input.autoResume||input.allowDelegation)&&input.kind!=='work')throw new Error('Checkpoint continuation and delegation require an approved work task.');
 return {autoResume:input.autoResume===true,allowDelegation:input.allowDelegation===true,routeHash:hasher(JSON.stringify(route||null)),hostPlatform:platform};
}
export function taskToolCapabilities(task:Task):ToolCapabilities {return {delegation:task.policy?.allowDelegation===true&&!task.parentTaskId&&!task.grading&&!task.fieldFill,readOnly:task.kind==='review',grading:!!task.grading,fieldFill:!!task.fieldFill};}
export function taskGroup(project:Project,task:Task){const root=task.parentTaskId||task.id;return project.tasks.filter(entry=>entry.id===root||entry.parentTaskId===root);}
export function groupJournal(project:Project,task:Task){return taskGroup(project,task).reduce<ToolReceipt[]>((journal,entry)=>journal.concat(entry.toolJournal||[]),[]);}
export function resumeIssue(project:Project,task:Task,platform:string,hasher:(source:string)=>string):string {
 if(task.creationId&&(!project.creation||task.creationId!==project.creation.id||task.creationBriefHash!==creationBriefHash(project.creation,hasher)))return 'The source-to-world creation brief changed. Approve a fresh creation task.';
 if(task.state!=='INTERRUPTED'||task.kind!=='work'||task.parentTaskId)return 'Only interrupted root work can continue from a checkpoint.';
 if(!task.policy?.autoResume)return 'Automatic checkpoint continuation was not approved for this task.';
 if(!orchestrationCapabilities(platform,task.route?.protocol).checkpointResume||task.policy.hostPlatform!==platform)return 'Checkpoint continuation is unavailable on this host/provider.';
 if(task.policy.routeHash!==hasher(JSON.stringify(task.route||null)))return 'The frozen provider route changed.';
 if((task.resumes?.length||0)>=orchestrationLimits.resumes)return 'The task reached its two-continuation limit.';
 if(project.status&&project.status!=='active')return 'Archived or trashed projects cannot continue automatically.';
 if(project.tasks.find(entry=>!entry.parentTaskId)?.id!==task.id)return 'A newer root task superseded this interrupted task.';
 if(project.tasks.some(entry=>entry.id!==task.id&&['PREPARED','RUNNING'].includes(entry.state)))return 'Another task is already active.';
 if(project.draft||task.editorContext?.hasUnappliedEdits)return 'An editing draft or unapplied form needs review.';
 if(hasher(project.activeSource)!==task.baseHash)return 'The active world changed after the original task started.';
 if(project.candidates.some(candidate=>candidate.id===task.id))return 'A partial proposal already exists; review it instead.';
 if(task.toolSummary||taskGroup(project,task).some(entry=>entry.toolSummary))return 'Detailed execution evidence expired; restart explicitly.';
 const journal=groupJournal(project,task);
 if(journal.some(receipt=>receipt.state==='pending'))return 'Unsettled delegated receipts require host recovery first.';
 if(journal.length>=toolJournalLimits.calls||JSON.stringify(journal).length>toolJournalLimits.totalCharacters-4096)return 'The lifetime tool journal budget is exhausted.';
 try{
  if(hasher(task.baseSource)!==task.baseHash)throw new Error('The original snapshot no longer matches its hash.');
  doc.parse(task.stagedSource);doc.assertPackageMetadataUnchanged(task.baseSource,task.stagedSource);
  const changes=doc.diff(task.baseSource,task.stagedSource,2000,0);
  if(changes.total>2000)throw new Error('The bounded scope check is incomplete.');
  if(task.workOrder.allowedPaths.length&&changes.changes.some(change=>!task.workOrder.allowedPaths.some(path=>path.every((key,index)=>change.path[index]===key))))throw new Error('Staged changes exceed the approved scope.');
 }catch(error){return (error as Error).message;}
 return '';
}
