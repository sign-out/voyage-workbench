import {sha256} from 'js-sha256';
import {assistantRecoverySettings,type AssistantRecoverySettings} from './assistant-recovery';
import {sectionCheckpointPaths,validateSectionCheckpoint,type SectionCheckpoint} from './section-checkpoints';
export {assistantRecoverySettings} from './assistant-recovery';
export type {AssistantRecoverySettings} from './assistant-recovery';
import {chatPlanContent,type ChatPlan} from './chat-plans';
import workValidationReferences from './work-validation.json';
import * as fieldFill from './field-fill';
import {fieldFillSnapshot,fieldFillPrompt,parseFieldFill,type FieldFillSnapshot} from './field-fill';
import * as doc from './document';
import {editorSnapshot,type EditorSnapshot} from './assistant-context';
import * as assistantContext from './assistant-context';
import * as providers from './providers';
import * as covers from './covers';
import * as codexMedia from './codex-media';
import * as harness from './harness';
import * as voyage from './voyage';
import {worldIdentity} from './features';
import type {TaskRoute} from './providers';
import {notePath,noteQueue,notePlanningPrompt,reconcileNotes,readBuilderNotes,type BuilderNote,type NotePlanItem} from './builder-notes';
export {readBuilderNotes} from './builder-notes';
import {proposedOrder,type WorkOrder} from './work-orders';
import * as authoring from './authoring';
import {proposedArtwork,type ArtworkProposal} from './artwork-requests';
import {gradingSnapshot,gradingPrompt,parseRubric,parseGradeReport,type Rubric,type GradingSnapshot,type GradeReport} from './world-grading';
export type {WorkOrder} from './work-orders';
export interface ApprovedWorkOrder extends WorkOrder {approvalBaseHash?:string}
export interface WorkOrderProposal {id:string;taskId:string;baseHash:string;order:WorkOrder;created:number;noteIds?:string[]}
export type LocalEditMode='automatic'|'proposal-only';
export function localEditMode(value:unknown=''):LocalEditMode {if(value==='')return 'automatic';if(value==='automatic'||value==='proposal-only')return value;throw new Error('Choose automatic local apply or proposal-only.');}
export interface Task {editorContext?:EditorSnapshot;localEditMode?:LocalEditMode;localApplyBlockedReason?:string;id:string;attempt:string;kind:'plan'|'work';state:string;prompt:string;reply:string;baseSource:string;baseHash:string;stagedSource:string;workOrder:ApprovedWorkOrder;sourceNoteIds?:string[];builderNotes?:BuilderNote[];noteQueue?:NotePlanItem[];sessionId?:string;route?:TaskRoute;created:number;error?:string}
export interface NoteChangeReceipt {id:string;taskId:string;proposalId:string;noteIds:string[];title:string;beforeHash:string;afterHash:string;beforeCheckpointId:string;afterCheckpointId:string;created:number}
export interface Candidate {id:string;title:string;source:string;baseHash:string;created:number;kind:string;sourceProposalId?:string;noteIds?:string[];importNote?:string;rejectedChanges?:doc.ChangeChoice[]}
export interface Project {artworkProposals?:ArtworkProposal[];bookmarks?:{id:string;path:doc.Path;name:string}[];builderContextDefault?:boolean;id:string;name:string;activeSource:string;originalSource?:string;status?:'active'|'archived'|'trashed';memory?:string;attachments?:{id:string;name:string;source:string}[];workOrderProposals?:WorkOrderProposal[];builderNotes?:BuilderNote[];noteChanges?:NoteChangeReceipt[];sourceRevision:number;draft:null|{path:doc.Path;text:string;baseHash:string};candidates:Candidate[];tasks:Task[];chat:{role:string;text:string;editorContext?:Pick<EditorSnapshot,'screen'|'label'|'focusPaths'>}[];workOrder:ApprovedWorkOrder;remote:{environment?:string;envelopeSource?:string;worldId:string;etag:string;baselineHash:string;operations:any[];validation?:any};updated:number}
export interface Project {grading?:{rubric?:Rubric;reports:GradeReport[]}}
export interface Project {chatPlan?:ChatPlan}
export interface Task {grading?:GradingSnapshot;fieldFill?:FieldFillSnapshot}
export interface Task {assistantRecovery?:AssistantRecoverySettings}
export interface Task {sectionCheckpoints?:SectionCheckpoint[]}

export function assistantCompletionValidation(project:Project,task:Task,text:string):{valid:true} {
 if(task.fieldFill)parseFieldFill(text,task.fieldFill);
 else if(task.grading)parseGradeReport(text,task.grading,task.baseSource,{id:task.id,taskId:task.id,sourceHash:task.baseHash,created:project.updated});
 return {valid:true};
}
let nativeHasher:((source:string)=>string)|undefined;
export function setHasher(fn:(source:string)=>string){nativeHasher=fn;}
export const hash=(source:string)=>nativeHasher?nativeHasher(source):sha256(source);
export function create(id:string,name:string,source:string,now:number):Project {doc.parse(source);return {id,name,activeSource:source,originalSource:source,status:'active',memory:'',attachments:[],sourceRevision:0,draft:null,candidates:[],tasks:[],chat:[],workOrder:{objective:'',requirements:[],allowedPaths:[]},remote:{worldId:'',etag:'',baselineHash:'',operations:[]},updated:now};}
export function projectSummary(project:Project){
 const envelope=worldIdentity(project.remote.envelopeSource||'',project.name),world=worldIdentity(project.activeSource,envelope.title);
 return {id:project.id,name:project.name,updated:project.updated,status:project.status||'active',worldTitle:world.title,shortId:project.remote.worldId||world.shortId||envelope.shortId};
}
function requireCurrent(p:Project,expected:string){if(hash(p.activeSource)!==expected)throw new Error('The world changed. Reload before applying this change.');}
function approvedScope(source:string,order:ApprovedWorkOrder):WorkOrder {
  if(order.reviewedScope!==true||order.approvalBaseHash!==hash(source))throw new Error('Review and explicitly approve the Work Order scope for the current world before execution.');
  const checked=proposedOrder(source,{objective:order.objective,requirements:order.requirements,allowedPaths:order.wholeWorld===true?[]:order.allowedPaths,wholeWorld:order.wholeWorld});
  if(JSON.stringify(checked.allowedPaths)!==JSON.stringify(order.allowedPaths))throw new Error('The approved Work Order scope is malformed. Review and approve it again.');
  return checked;
}
export function reduce(project:Project,c:any):Project {
  const p:Project={...project,draft:project.draft?{...project.draft}:null,candidates:project.candidates.slice(),tasks:project.tasks.map(t=>({...t})),chat:project.chat.slice(),workOrder:{...project.workOrder},remote:{...project.remote,operations:project.remote.operations.map(o=>({...o}))}};p.updated=c.now||Date.now();
  function task():Task {const t=p.tasks.filter(t=>t.id===c.taskId&&(!c.attempt||t.attempt===c.attempt))[0];if(!t)throw new Error('This task attempt no longer exists.');return t;}
  function active(source:string,protectMetadata=true){doc.parse(source);if(protectMetadata)doc.assertPackageMetadataUnchanged(p.activeSource,source);p.builderNotes=reconcileNotes(p.builderNotes||[],p.activeSource,source,c.type==='edit'?c.path:c.type==='applyDraft'?p.draft?.path:undefined);p.activeSource=source;p.sourceRevision++;p.draft=null;}
  function acceptCandidate(candidate:Candidate){
    requireCurrent(p,candidate.baseHash);const before=p.activeSource,selected=doc.selectChanges(before,candidate.source,candidate.rejectedChanges);
    active(candidate.kind==='import'&&p.remote.worldId?doc.preserveVoyageFields(before,selected).source:selected,!['import','remote'].includes(candidate.kind));
    if(candidate.sourceProposalId&&candidate.noteIds?.length&&before!==p.activeSource)p.noteChanges=[...(p.noteChanges||[]),{id:candidate.id,taskId:candidate.id,proposalId:candidate.sourceProposalId,noteIds:candidate.noteIds.slice(),title:candidate.title,beforeHash:hash(before),afterHash:hash(p.activeSource),beforeCheckpointId:c.beforeCheckpointId||'',afterCheckpointId:c.afterCheckpointId||'',created:p.updated}];
    p.candidates=p.candidates.filter(value=>value.id!==candidate.id);
  }
  if(p.draft&&['edit','insert','remove','accept'].indexOf(c.type)>=0)throw new Error('Apply or discard the editor draft first.');
  switch(c.type){
    case 'chatPlan':{
      if(!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision!==(p.chatPlan?.revision||0))throw new Error('The saved plan changed. Reload it before saving again.');
      p.chatPlan={...chatPlanContent(c.plan),revision:c.expectedRevision+1,updated:p.updated};break;
    }
    case 'gradingRubric':{
      if(p.tasks.some(t=>t.grading&&['PREPARED','RUNNING'].includes(t.state)))throw new Error('Stop or finish grading before changing the rubric.');
      const rubric=c.rubric===undefined?undefined:parseRubric(c.rubric);
      p.grading={rubric,reports:p.grading?.reports||[]};break;
    }
    case 'gradingFixOrder':{
      requireCurrent(p,c.baseHash);if(p.draft)throw new Error('Apply or discard the editor draft before suggesting fixes.');
      const report=p.grading?.reports.find(report=>report.id===c.reportId),fix=report?.fixes.find(fix=>fix.id===c.fixId);
      if(!report||!fix)throw new Error('This grading fix no longer exists.');
      if(report.sourceHash!==hash(p.activeSource))throw new Error('The world changed. Regrade before creating a fix order.');
      if(report.rubricHash!==gradingSnapshot(p.grading?.rubric,report.selection).rubricHash)throw new Error('The rubric changed. Regrade before creating a fix order.');
      if(typeof c.id!=='string'||!c.id||p.workOrderProposals?.some(proposal=>proposal.id===c.id))throw new Error('Provide a unique proposal ID.');
      const order=proposedOrder(p.activeSource,{objective:fix.title,requirements:fix.requirements,allowedPaths:fix.wholeWorld?[]:fix.allowedPaths,wholeWorld:fix.wholeWorld===true});
      p.workOrderProposals=[...(p.workOrderProposals||[]),{id:c.id,taskId:report.taskId,baseHash:report.sourceHash,order,created:p.updated}];break;
    }
    case 'bookmark':{
      requireCurrent(p,c.baseHash);authoring.authoredPath(p.activeSource,c.path,true);
      if(typeof c.id!=='string'||!c.id||typeof c.name!=='string'||!c.name.trim()||c.name.length>200)throw new Error('Provide a bookmark name of 1–200 characters.');
      const bookmarks=(p.bookmarks||[]).filter(bookmark=>bookmark.id!==c.id);if(bookmarks.length>=500)throw new Error('This project has 500 bookmarks. Remove one before adding another.');
      p.bookmarks=[...bookmarks,{id:c.id,path:c.path.slice(),name:c.name.trim()}];break;
    }
    case 'removeBookmark':p.bookmarks=(p.bookmarks||[]).filter(bookmark=>bookmark.id!==c.id);break;
    case 'builderContextDefault':if(typeof c.include!=='boolean')throw new Error('Choose whether to include builder context.');p.builderContextDefault=c.include;break;
    case 'authoringProposal':{
      requireCurrent(p,c.baseHash);if(p.draft)throw new Error('Apply or discard the editor draft before preparing authoring changes.');
      if(typeof c.id!=='string'||!c.id||p.candidates.some(candidate=>candidate.id===c.id))throw new Error('Provide a unique proposal ID.');
      const source=c.operation==='duplicate'?authoring.duplicateEntry(p.activeSource,c.path,c.newKey,c.name):c.operation==='batch'?authoring.batchEdit(p.activeSource,c.paths,c.field,c.source):null;
      if(source===null)throw new Error('Unsupported authoring operation.');if(source===p.activeSource)throw new Error('There are no changes to review.');
      p.candidates.unshift({id:c.id,title:c.operation==='duplicate'?'Duplicate '+doc.label(c.path)+' as '+c.newKey:'Batch edit '+c.paths.length+' entries · '+c.field,source,baseHash:c.baseHash,created:p.updated,kind:'authoring'});break;
    }
    case 'projectStatus':if(!['active','archived','trashed'].includes(c.status))throw new Error('Invalid project status.');if(p.tasks.some(t=>['PREPARED','RUNNING'].includes(t.state)))throw new Error('Stop the active task first.');p.status=c.status;break;
    case 'builderNote':{
      requireCurrent(p,c.baseHash);
      const input=c.note;if(!input||typeof input.id!=='string'||!input.id||input.id.length>100||typeof input.text!=='string'||!input.text.trim()||input.text.length>20000||typeof input.planning!=='boolean')throw new Error('Notes need an ID, nonempty text (up to 20,000 characters), and a planning flag.');
      const path=notePath(input.path),notes=p.builderNotes||[],existing=notes.find(note=>note.id===input.id);
      if(existing&&c.expectedRevision!==existing.revision)throw new Error('This note changed. Reload before saving.');
      const moved=existing&&JSON.stringify(existing.path)!==JSON.stringify(path);
      if(moved&&!c.reattach)throw new Error('Use explicit reattachment to move a note.');
      if(!existing||moved||c.reattach)doc.at(doc.parse(p.activeSource),path);
      const note:BuilderNote={id:input.id,path,text:input.text,planning:input.planning,revision:(existing?.revision||0)+1,created:existing?.created||p.updated,updated:p.updated,originalPath:existing?.originalPath||existing?.path||path.slice(),originalHash:existing?.originalHash||c.baseHash,...(existing?.lastPlan&&existing.text===input.text&&existing.planning===input.planning&&!moved&&!c.reattach?{lastPlan:{...existing.lastPlan,noteRevision:existing.revision+1}}:{}),...(existing?.unresolved&&!c.reattach?{unresolved:existing.unresolved}:{})};
      p.builderNotes=notes.filter(value=>value.id!==note.id).concat([note]);break;
    }
    case 'deleteBuilderNote':{
      const note=p.builderNotes?.find(note=>note.id===c.id);if(!note||note.revision!==c.expectedRevision)throw new Error('This note changed. Reload before deleting.');
      p.builderNotes=(p.builderNotes||[]).filter(note=>note.id!==c.id);break;
    }
    case 'requeueBuilderNote':{
      const note=p.builderNotes?.find(note=>note.id===c.id);if(!note||note.revision!==c.expectedRevision)throw new Error('This note changed. Reload before returning it to the queue.');
      p.builderNotes=(p.builderNotes||[]).map(value=>value.id===c.id?{...value,planning:true,lastPlan:undefined,revision:value.revision+1,updated:p.updated}:value);break;
    }
    case 'recordNotePlan':{
      const t=task();if(t.kind!=='plan'||t.state!=='RUNNING'||c.attempt!==t.attempt)throw new Error('Only the current running planner can record a note outcome.');
      const item=t.noteQueue?.find(item=>item.noteId===c.noteId);if(!item)throw new Error('Note is not in this task queue.');
      if(!['proposed','clarification','blocked'].includes(c.state)||typeof c.explanation!=='string'||!c.explanation.trim()||c.explanation.length>10000)throw new Error('Record a supported outcome and a nonempty explanation.');
      if(c.state==='proposed'&&!p.workOrderProposals?.some(proposal=>proposal.id===c.proposalId&&proposal.taskId===t.id&&proposal.baseHash===t.baseHash))throw new Error('Record an existing proposal from this planning task.');
      t.noteQueue=t.noteQueue!.map(value=>value.noteId===c.noteId?{...value,state:c.state,explanation:c.explanation,...(c.state==='proposed'?{proposalId:c.proposalId}:{proposalId:undefined})}:value);
      if(c.state==='proposed')p.workOrderProposals=(p.workOrderProposals||[]).map(proposal=>proposal.id===c.proposalId?{...proposal,noteIds:Array.from(new Set([...(proposal.noteIds||[]),item.noteId]))}:proposal);
      p.builderNotes=(p.builderNotes||[]).map(note=>note.id===item.noteId&&note.revision===item.noteRevision?{...note,lastPlan:{state:c.state,explanation:c.explanation,...(c.state==='proposed'?{proposalId:c.proposalId}:{}),taskId:t.id,baseHash:t.baseHash,noteRevision:item.noteRevision,created:p.updated}}:note);break;
    }
    case 'memory':p.memory=String(c.text).slice(0,50000);break;
    case 'attachMod':doc.parse(c.source);p.attachments=(p.attachments||[]).filter(a=>a.id!==c.id).concat([{id:c.id,name:c.name,source:c.source}]);break;
    case 'detachMod':p.attachments=(p.attachments||[]).filter(a=>a.id!==c.id);break;
    case 'recoverPartial':{const t=task();if(!['FAILED','CANCELED','INTERRUPTED'].includes(t.state)||!t.stagedSource||t.stagedSource===t.baseSource)throw new Error('No interrupted edits to recover.');if(p.candidates.some(v=>v.id===t.id))throw new Error('Partial proposal already exists.');p.candidates.unshift({id:t.id,title:'Partial: '+t.prompt.slice(0,90),source:t.stagedSource,baseHash:t.baseHash,created:p.updated,kind:'partial agent',...(t.workOrder.sourceProposalId?{sourceProposalId:t.workOrder.sourceProposalId,noteIds:t.sourceNoteIds?.slice()||[]}:{})});break;}
    case 'rename': if(!String(c.name).trim())throw new Error('Enter a project name.');p.name=String(c.name).trim().slice(0,200);break;
    case 'draft': requireCurrent(p,c.baseHash);p.draft={path:c.path,text:c.text,baseHash:c.baseHash};break;
    case 'discardDraft':p.draft=null;break;
    case 'applyDraft':if(!p.draft)throw new Error('There is no draft to apply.');requireCurrent(p,p.draft.baseHash);active(doc.edit(p.activeSource,p.draft.path,p.draft.text));break;
    case 'edit':requireCurrent(p,c.baseHash);active(doc.edit(p.activeSource,c.path,c.source));break;
    case 'insert':requireCurrent(p,c.baseHash);active(doc.insert(p.activeSource,c.path,c.key,c.source));break;
    case 'remove':requireCurrent(p,c.baseHash);active(doc.remove(p.activeSource,c.path));break;
    case 'stage':{doc.parse(c.source);const aligned=!c.kind||['import','remote'].includes(c.kind)?doc.alignImport(p.activeSource,c.source,(!c.kind||c.kind==='import')&&!!p.remote.worldId):{source:c.source,note:''};p.candidates.unshift({id:c.id,title:c.title,source:aligned.source,importNote:aligned.note,baseHash:c.baseHash||hash(p.activeSource),created:p.updated,kind:c.kind||'import'});break;}
    case 'candidateChange':{const candidate=p.candidates.find(candidate=>candidate.id===c.id);if(!candidate)throw new Error('Proposal no longer exists.');requireCurrent(p,candidate.baseHash);if(c.candidateHash!==hash(candidate.source))throw new Error('The proposal changed. Reload its diff.');if(typeof c.reject!=='boolean'||!doc.diff(p.activeSource,candidate.source,1,0,{kind:c.kind,path:c.path}).changes.some(change=>change.kind===c.kind&&JSON.stringify(change.path)===JSON.stringify(c.path)))throw new Error('This diff change no longer exists.');const choices=(candidate.rejectedChanges||[]).filter(choice=>choice.kind!==c.kind||JSON.stringify(choice.path)!==JSON.stringify(c.path));if(c.reject)choices.push({path:c.path.slice(),kind:c.kind});p.candidates=p.candidates.map(value=>value.id===c.id?{...value,rejectedChanges:choices}:value);break;}
    case 'reject':p.candidates=p.candidates.filter(v=>v.id!==c.id);break;
    case 'accept':{const candidate=p.candidates.filter(value=>value.id===c.id)[0];if(!candidate)throw new Error('Proposal no longer exists.');acceptCandidate(candidate);break;}
    case 'proposeArtwork':{
      const t=task();if(t.kind!=='plan'||t.state!=='RUNNING'||c.attempt!==t.attempt)throw new Error('Only the current running planning attempt can propose artwork.');
      if(t.fieldFill)throw new Error('Field fill is read only.');
      if(t.grading)throw new Error('Grading is read only. Suggest fixes explicitly from the grading report.');
      requireCurrent(p,t.baseHash);
      if(typeof c.id!=='string'||!c.id||p.artworkProposals?.some(proposal=>proposal.id===c.id))throw new Error('Provide a unique artwork proposal ID.');
      if((p.artworkProposals||[]).length>=500)throw new Error('Review or dismiss existing artwork requests before adding more.');
      const request=proposedArtwork(t.baseSource,c.request);
      if(p.artworkProposals?.some(proposal=>proposal.taskId===t.id&&proposal.destinationId===request.destinationId))throw new Error('This task already proposed artwork for that destination.');
      p.artworkProposals=[...(p.artworkProposals||[]),{...request,id:c.id,taskId:t.id,baseHash:t.baseHash,created:p.updated}];break;
    }
    case 'dismissArtworkProposal':p.artworkProposals=(p.artworkProposals||[]).filter(proposal=>proposal.id!==c.id);break;
    case 'proposeWorkOrder':{
      const t=task();if(t.kind!=='plan'||t.state!=='RUNNING'||c.attempt!==t.attempt)throw new Error('Only the current running planning attempt can propose a Work Order.');
      if(t.fieldFill)throw new Error('Field fill is read only.');
      if(t.grading)throw new Error('Grading is read only. Suggest fixes explicitly from the grading report.');
      requireCurrent(p,t.baseHash);
      if(typeof c.id!=='string'||!c.id||p.workOrderProposals?.some(proposal=>proposal.id===c.id))throw new Error('Provide a unique proposal ID.');
      const order=proposedOrder(t.baseSource,c.order);
      p.workOrderProposals=[...(p.workOrderProposals||[]),{id:c.id,taskId:t.id,baseHash:t.baseHash,order,created:p.updated}];break;
    }
    case 'dismissWorkOrderProposal':if(p.tasks.some(task=>['PREPARED','RUNNING'].includes(task.state)&&task.workOrder.sourceProposalId===c.id))throw new Error('Stop the task before dismissing its source suggestion.');p.workOrderProposals=(p.workOrderProposals||[]).filter(proposal=>proposal.id!==c.id);break;
    case 'workOrder':{
      if(c.order.sourceProposalId&&!p.workOrderProposals?.some(proposal=>proposal.id===c.order.sourceProposalId&&proposal.baseHash===hash(p.activeSource)))throw new Error('The source Work Order suggestion is missing or stale. Reload it before approving.');
      if(c.order.reviewedScope===true){
        requireCurrent(p,c.baseHash);
        const checked=proposedOrder(p.activeSource,{objective:c.order.objective,requirements:c.order.requirements,allowedPaths:c.order.wholeWorld?[]:c.order.allowedPaths,wholeWorld:c.order.wholeWorld===true});
        c={...c,order:{...c.order,...checked}};
      }
      p.workOrder={...(c.order.reviewedScope===true?{reviewedScope:true,approvalBaseHash:hash(p.activeSource)}:{}),objective:String(c.order.objective||''),requirements:c.order.requirements||[],allowedPaths:c.order.allowedPaths||[],...(typeof c.order.wholeWorld==='boolean'?{wholeWorld:c.order.wholeWorld}:{}),...(c.order.sourceProposalId?{sourceProposalId:c.order.sourceProposalId}:{})};break;
    }
    case 'prepareTask':{
      if(p.tasks.some(t=>['PREPARED','RUNNING'].indexOf(t.state)>=0))throw new Error('Finish or stop the current task first.');
      if(!['plan','work'].includes(c.kind))throw new Error('Invalid task kind.');
      if(c.grading!==undefined&&(c.kind!=='plan'||c.addressNotes||p.draft))throw new Error('Grading requires a read-only planning task without unapplied edits.');
      if(c.fieldFill!==undefined&&(c.kind!=='plan'||c.grading!==undefined||c.addressNotes))throw new Error('Field fill requires an isolated read-only planning task.');
      const fill=c.fieldFill===undefined?undefined:fieldFillSnapshot(c.fieldFill);
      const baseSource=fill?c.fieldFill.source:p.activeSource;
      const grading=c.grading===undefined?undefined:gradingSnapshot(p.grading?.rubric,c.grading);
      if(c.kind==='work'&&!p.workOrder.objective.trim())throw new Error('Write or approve a Work Order first.');
      if(c.kind==='work'&&p.workOrder.sourceProposalId&&!p.workOrderProposals?.some(proposal=>proposal.id===p.workOrder.sourceProposalId&&proposal.baseHash===hash(p.activeSource)))throw new Error('The originating Work Order suggestion is stale or missing. Refresh it or explicitly detach its link.');
      if(c.kind==='work'){if(p.draft)throw new Error('Apply or discard the editor draft before approving work.');approvedScope(baseSource,p.workOrder);}
      if(c.includeBuilderNotes!==undefined&&typeof c.includeBuilderNotes!=='boolean')throw new Error('Choose whether to include builder notes for this task.');
      if(c.addressNotes&&c.kind!=='plan')throw new Error('Flagged notes can only start a planning task.');
      if(c.addressNotes&&p.draft)throw new Error('Apply or discard the editor draft before planning flagged notes.');
      const queuedNotes=c.addressNotes?noteQueue(p.builderNotes||[]):undefined;
      const taskPrompt=fill?fieldFillPrompt(fill):grading?gradingPrompt(grading):queuedNotes?notePlanningPrompt(queuedNotes):c.prompt||p.workOrder.objective;
      const includeNotes=!fill&&!grading&&(c.addressNotes||(typeof c.includeBuilderNotes==='boolean'?c.includeBuilderNotes:p.builderContextDefault!==false));
      const noteSnapshot=(includeNotes?p.builderNotes||[]:[]).map(note=>({...note,path:note.path.slice()}));
      const editorContext=fill||grading?undefined:editorSnapshot(p.activeSource,c.editorContext);
      const applyMode=c.localEditMode===undefined?'proposal-only':localEditMode(c.localEditMode);
      p.tasks.unshift({assistantRecovery:assistantRecoverySettings(c.assistantRecovery),localEditMode:applyMode,...(editorContext?{editorContext}:{}),id:c.id,attempt:c.attempt,kind:c.kind,state:'PREPARED',prompt:taskPrompt,builderNotes:noteSnapshot,sourceNoteIds:c.kind==='work'?(p.workOrderProposals?.find(proposal=>proposal.id===p.workOrder.sourceProposalId)?.noteIds?.slice()||[]):[],...(queuedNotes?{noteQueue:queuedNotes}:{}),reply:'',baseSource,baseHash:hash(baseSource),stagedSource:baseSource,workOrder:fill?{objective:'',requirements:[],allowedPaths:[]}:p.workOrder,route:c.route,created:p.updated});
      if(grading)p.tasks[0].grading=grading;
      if(fill)p.tasks[0].fieldFill=fill;
      if(c.kind==='plan'&&!grading&&!fill)p.chat.push({role:'user',...(editorContext?{editorContext:{screen:editorContext.screen,label:editorContext.label,focusPaths:editorContext.focusPaths}}:{}),text:queuedNotes?'Address project notes · '+queuedNotes.length+' flagged notes':c.prompt});break;
    }
    case 'taskRunning':{const t=task();if(t.state!=='PREPARED')throw new Error('Task is not prepared.');t.state='RUNNING';break;}
    case 'taskReply':{const t=task();if(t.state!=='RUNNING')throw new Error('Task is no longer running.');t.reply=c.text;break;}
    case 'taskSession':task().sessionId=c.sessionId;break;
    case 'taskEdit':{
      const t=task();if(t.kind!=='work'||t.state!=='RUNNING')throw new Error('Planning and interrupted tasks cannot edit a world.');
      const scope=approvedScope(t.baseSource,t.workOrder);
      if(hash(t.baseSource)!==t.baseHash)throw new Error('The frozen Work Order source changed. Review and approve it again.');
      if(!Array.isArray(c.path)||!scope.allowedPaths.some(path=>path.every((key,index)=>c.path[index]===key)))throw new Error('This path is outside the approved Work Order scope.');
      const nextSource=c.action==='insert'?doc.insert(t.stagedSource,c.path,c.key,c.source):c.action==='remove'?doc.remove(t.stagedSource,c.path):doc.edit(t.stagedSource,c.path,c.source);doc.assertPackageMetadataUnchanged(t.stagedSource,nextSource);t.stagedSource=nextSource;break;
    }
    case 'taskSectionCheckpoint':{
      const t=task();if(t.kind!=='work'||t.state!=='RUNNING')throw new Error('Checkpoint tool is unavailable for planning or interrupted tasks.');
      if(!c.attempt||c.attempt!==t.attempt)throw new Error('This task attempt no longer exists.');
      const scope=approvedScope(t.baseSource,t.workOrder);
      if(hash(t.baseSource)!==t.baseHash)throw new Error('The frozen Work Order source changed. Review and approve it again.');
      const paths=sectionCheckpointPaths(c.paths,scope.allowedPaths,doc.statePath(doc.parse(t.baseSource))),last=t.sectionCheckpoints?.at(-1),sourceHash=hash(t.stagedSource);
      const before=last?c.sectionBaseSource:t.baseSource;
      if(typeof before!=='string'||hash(before)!==(last?.sourceHash||t.baseHash))throw new Error('The frozen section checkpoint source changed or is unavailable.');
      if(last?.sourceHash===sourceHash&&JSON.stringify(last.paths)===JSON.stringify(paths))break;
      if(typeof c.label!=='string'||!c.label.trim()||c.label.length>200)throw new Error('Checkpoint label must be a nonempty string of at most 200 characters.');
      const result=validateSectionCheckpoint(before,t.stagedSource,paths,last);
      if(typeof c.sectionCheckpointId!=='string'||!c.sectionCheckpointId)throw new Error('Section checkpoint storage is unavailable.');
      t.sectionCheckpoints=[...(t.sectionCheckpoints||[]),{id:c.sectionCheckpointId,sequence:(last?.sequence||0)+1,label:c.label.trim(),paths,sourceHash,preexistingErrors:result.preexistingErrors}];break;
    }
    case 'taskDone':{const t=task();if(t.state!=='RUNNING')throw new Error('Task is no longer running.');t.reply=c.text||t.reply;
      if(t.fieldFill){t.fieldFill={...t.fieldFill,result:parseFieldFill(t.reply,t.fieldFill)};t.state='COMPLETED';}
      else if(t.grading){
        const report=parseGradeReport(t.reply,t.grading,t.baseSource,{id:t.id,taskId:t.id,sourceHash:t.baseHash,created:p.updated});
        p.grading={...p.grading,reports:[report,...(p.grading?.reports||[])].slice(0,20)};t.state='COMPLETED';
      }
      else if(t.kind==='plan'){t.state='COMPLETED';p.chat.push({role:'assistant',text:t.reply});p.chat=p.chat.slice(-60);}
      else {
        const candidate:Candidate={id:t.id,title:t.workOrder.objective.slice(0,100),source:t.stagedSource,baseHash:t.baseHash,created:p.updated,kind:'agent',...(t.workOrder.sourceProposalId?{sourceProposalId:t.workOrder.sourceProposalId,noteIds:t.sourceNoteIds?.slice()||[]}:{})};
        t.state='PROPOSAL_READY';p.candidates.unshift(candidate);
        if(t.localEditMode==='automatic'){
          if(p.draft||t.editorContext?.hasUnappliedEdits)t.localApplyBlockedReason='An editing draft or unapplied form needs review. Apply or discard your edits, then review this proposal.';
          else if(hash(p.activeSource)!==t.baseHash)t.localApplyBlockedReason='The local world changed during this task. Review the proposal instead of overwriting newer changes.';
          else if(t.stagedSource===p.activeSource){t.state='COMPLETED';p.candidates=p.candidates.filter(value=>value.id!==t.id);}
          else {
            try {approvedScope(t.baseSource,t.workOrder);if(hash(t.baseSource)!==t.baseHash)throw new Error('The frozen Work Order source changed.');}
            catch(error){t.localApplyBlockedReason=String((error as Error).message)+' Review this proposal instead.';}
            if(!t.localApplyBlockedReason){
              const errors=doc.validate(t.stagedSource,workValidationReferences).filter(issue=>issue.level==='error');
              if(errors.length)t.localApplyBlockedReason='Local validation blocked automatic apply: '+errors.length+' error(s); '+doc.label(errors[0].path)+': '+errors[0].message+' Review this proposal manually, including any pre-existing imported errors.';
              else {acceptCandidate(candidate);t.state='APPLIED';}
            }
          }
        }
      }t.baseSource='';t.stagedSource='';t.builderNotes=[];break;}
    case 'taskStop':{const t=task();if(['PREPARED','RUNNING'].indexOf(t.state)>=0){t.state=c.state||'CANCELED';t.error=c.error||'';t.builderNotes=[];}break;}
    case 'recover':p.tasks.forEach(t=>{if(['PREPARED','RUNNING'].indexOf(t.state)>=0){t.state='INTERRUPTED';t.error='The host stopped. Restart explicitly from the saved Work Order.';}});break;
    case 'remoteLink':if(p.remote.operations.some(o=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].indexOf(o.state)>=0))throw new Error('Reconcile the pending save first.');p.remote.environment=c.environment||'production';if(c.envelopeSource){doc.parse(c.envelopeSource);p.remote.envelopeSource=c.envelopeSource;}p.remote.validation=undefined;p.remote.worldId=c.worldId;p.remote.etag=c.etag;p.remote.baselineHash=c.baselineHash;break;
    case 'remoteValidation':p.remote.validation=c.result;break;
    case 'savePrepare':{
      if(p.remote.operations.some(o=>['PREPARED','SEND_ATTEMPTED','UNKNOWN'].indexOf(o.state)>=0))throw new Error('Reconcile the previous save before starting another.');
      requireCurrent(p,c.baseHash);if(p.draft)throw new Error('Apply or discard the editor draft first.');if((c.etag&&p.remote.etag!==c.etag)||(c.worldId&&p.remote.worldId!==c.worldId))throw new Error('Remote revision changed. Validate again.');if(!p.remote.worldId||!p.remote.etag)throw new Error('Download a Voyage world before saving it.');
      p.remote.operations.unshift({id:c.id,state:'PREPARED',environment:p.remote.environment||'production',source:p.activeSource,payload:c.payload,sourceHash:hash(p.activeSource),expectedEtag:p.remote.etag,created:p.updated});p.remote.operations=p.remote.operations.slice(0,20);break;
    }
    case 'saveState':{const o=p.remote.operations.filter(o=>o.id===c.id)[0];if(!o)throw new Error('Save operation not found.');
      const allowed:Record<string,string[]>={PREPARED:['SEND_ATTEMPTED','REJECTED'],SEND_ATTEMPTED:['UNKNOWN','REJECTED','CONFIRMED'],UNKNOWN:['UNKNOWN','CONFIRMED','REJECTED']};
      if(!allowed[o.state]||allowed[o.state].indexOf(c.state)<0)throw new Error('Invalid save transition.');o.state=c.state;o.detail=c.detail||'';o.updated=p.updated;if(c.comparison)o.comparison=c.comparison;
      if(c.state==='CONFIRMED'){p.remote.etag=c.etag;p.remote.baselineHash=o.sourceHash;try{p.remote.envelopeSource=doc.read(o.payload,['world']);}catch{}}break;
    }
    default:throw new Error('Unknown project operation: '+c.type);
  }return p;
}
export function remotePayload(source:string,baseline?:string,worldId?:string):string {
  if(!doc.statePath(doc.parse(source)).length){if(!baseline||!doc.statePath(doc.parse(baseline)).length)throw new Error('Remote saves require the downloaded world envelope. Re-import the Alpha world to recover its metadata.');source=doc.alignImport(baseline,source).source;}
  if(worldId){const root=doc.parse(source),world=doc.at(root,doc.statePath(root).slice(0,-1)),identity=world.children.find(child=>child.key==='shortId');if(identity&&identity.node.value!==worldId)throw new Error('The document shortId differs from the linked Voyage world. Import it as a separate project.');}
  if(baseline&&worldId&&doc.statePath(doc.parse(baseline)).length){const root=doc.parse(baseline),world=doc.at(root,doc.statePath(root).slice(0,-1)),identity=world.children.find(child=>child.key==='shortId');if(identity&&identity.node.value!==worldId)throw new Error('The preserved Voyage envelope belongs to another world. Re-import the Alpha world before saving.');source=doc.preserveVoyageFields(baseline,source).source;}
  const root=doc.parse(source);const fields=['shortId','title','description','advancedDescription','discordThreadUrl','image','isLocked','isMod','isUnremixable','tags','visibility','initialGameState'];
  let prefix=doc.statePath(root).slice(0,-1);const object=doc.at(root,prefix);
  if(!object.children.some(c=>c.key==='initialGameState'))throw new Error('Remote saves require the downloaded world envelope.');
  return '{"world":{'+fields.filter(k=>object.children.some(c=>c.key===k)).map(k=>JSON.stringify(k)+':'+doc.read(source,prefix.concat(k))).join(',')+'}}';
}
export function nativeRequest(json:string):string {const r=JSON.parse(json);if(r.operation==='create')return JSON.stringify(create(r.id,r.name,r.source,r.now));if(r.operation==='reduce')return JSON.stringify(reduce(r.project,r.command));if(r.operation==='hash')return JSON.stringify(hash(r.source));if(r.operation==='payload')return JSON.stringify(remotePayload(r.source,r.baseline,r.worldId));const method=({readBuilderNotes,localEditMode,projectSummary,assistantRecoverySettings,assistantCompletionValidation} as any)[r.operation]||(fieldFill as any)[r.operation]||(assistantContext as any)[r.operation]||(authoring as any)[r.operation]||(doc as any)[r.operation]||(providers as any)[r.operation]||(voyage as any)[r.operation]||(covers as any)[r.operation]||(codexMedia as any)[r.operation]||(harness as any)[r.operation];if(typeof method!=='function')throw new Error('Unknown document operation');return JSON.stringify(method.apply(null,r.args||[]));}
