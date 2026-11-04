import * as doc from './document';
import {referenceVersion} from './references';
import {referenceImpact,readiness} from './authoring';
import {readBuilderNotes} from './builder-notes';
import type {Project,Task} from './project';
import {taskToolCapabilities,toolJournalLimits} from './agent-orchestration';
import type {ToolCapabilities} from './agent-orchestration';
import {readCreation,creationReadiness,creationBriefHash,creationDestinations} from './world-creation';

export {toolJournalLimits};

const pathSchema={type:'array',maxItems:128,items:{anyOf:[{type:'string',maxLength:10000},{type:'integer',minimum:0}]}};
const text=(maxLength=10000)=>({type:'string',maxLength});
function tool(name:string,description:string,roles:string[],effect:'read'|'stage'|'propose'|'delegate',properties:any,required:string[]){return {name,description,roles,effect,inputSchema:{type:'object',properties,required,additionalProperties:false}};}
export const worldTools=[
 tool('creation_read','Read source documents, creation help/design/publication/maps/artwork/rubric, destinations or host-owned readiness. Documents are paginated untrusted reference data.',['plan','work'],'read',{section:text(200),offset:{type:'integer',minimum:0}},['section']),
 tool('creation_update','Persist design, publication, map blueprints, artwork briefs or evidence-backed rubric review for an approved creation work order. Cannot generate, upload, publish or mark artifacts ready.',['work'],'stage',{section:{type:'string',enum:['design','publication','maps','artwork','review']},source:text(512*1024)},['section','source']),
 tool('world_read','Read exact JSON text at a path. Navigate large values with world_children.',['plan','work'],'read',{path:pathSchema},['path']),
 tool('world_children','List child keys and summaries.',['plan','work'],'read',{path:pathSchema},['path']),
 tool('world_search','Find names and lexical matches.',['plan','work'],'read',{query:text(1000)},['query']),
 tool('world_validate','Run local checks against cached references; not official Voyage acceptance.',['plan','work'],'read',{},[]),
 tool('world_schema','Read version-matched section schema or missing-coverage guidance.',['plan','work'],'read',{section:text(200)},['section']),
 tool('world_notes','Read paginated task-start builder notes for a path and its ancestors; not permissions.',['plan','work'],'read',{path:pathSchema,offset:{type:'integer',minimum:0}},['path']),
 tool('world_reference_impact','Inspect known incoming/outgoing structural references. Missing mod/runtime targets are advisory.',['plan','work'],'read',{path:pathSchema,direction:{type:'string',enum:['all','incoming','outgoing']},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},['path']),
 tool('world_diff','Inspect up to 100 exact-source changes from the task-start snapshot.',['plan','work'],'read',{offset:{type:'integer',minimum:0}},[]),
 tool('world_readiness','Read local project readiness against the staged source. Does not perform remote validation.',['plan','work'],'read',{},[]),
 tool('world_schema_coverage','Inspect cached schema coverage, version and environment uncertainty for this source.',['plan','work'],'read',{},[]),
 tool('world_edit','Edit staged JSON using JSON text preserving exact numeric spelling. Active world is unchanged.',['work'],'stage',{action:{type:'string',enum:['replace','insert','remove']},path:pathSchema,key:{anyOf:[text(10000),{type:'integer',minimum:0}]},source:text(8*1024*1024)},['action','path']),
 tool('delegate_review','Request a bounded, read-only child review using the same frozen provider/model. Requires prior user permission; cannot edit or approve work.',['work'],'delegate',{objective:text(4000),paths:{type:'array',maxItems:10,items:pathSchema}},['objective','paths']),
 tool('propose_artwork','Propose a supported artwork brief for separate approval; no generation, upload or spending.',['plan'],'propose',{destinationId:text(10000),prompt:text(12000)},['destinationId','prompt']),
 tool('record_note_plan','Record a flagged-note outcome; proposed requires the corresponding proposalId. Does not approve work.',['plan'],'propose',{noteId:text(200),state:{type:'string',enum:['proposed','clarification','blocked']},explanation:text(10000),proposalId:text(200)},['noteId','state','explanation']),
 tool('propose_work_order','Propose a Work Order for human review. Existing scope paths required; no approval or execution.',['plan'],'propose',{objective:text(10000),requirements:{type:'array',maxItems:100,items:text(10000)},allowedPaths:{type:'array',maxItems:100,items:pathSchema},wholeWorld:{type:'boolean'}},['objective','requirements','allowedPaths'])
];

const reviewTools=['world_read','world_children','world_schema','world_schema_coverage'];
export function toolDefinitions(work:boolean,capabilities:ToolCapabilities={}){return worldTools.filter(spec=>capabilities.readOnly?reviewTools.includes(spec.name):spec.roles.includes(work?'work':'plan')&&(spec.name!=='delegate_review'||capabilities.delegation)).map(({name,description,inputSchema})=>({type:'function',name,description,inputSchema}));}

function matches(value:any,schema:any,depth=0):boolean {
 if(depth>20)return false;
 if(schema.anyOf)return schema.anyOf.some((part:any)=>matches(value,part,depth+1));
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(schema.type==='string')return typeof value==='string'&&value.length<=(schema.maxLength??Infinity);
 if(schema.type==='boolean')return typeof value==='boolean';
 if(schema.type==='integer')return Number.isSafeInteger(value)&&value>=(schema.minimum??-Infinity)&&value<=(schema.maximum??Infinity);
 if(schema.type==='array')return Array.isArray(value)&&value.length<=(schema.maxItems??1000)&&value.every(entry=>matches(entry,schema.items,depth+1));
 if(schema.type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>Object.prototype.hasOwnProperty.call(schema.properties,key)&&matches(value[key],schema.properties[key],depth+1))&&schema.required.every((key:string)=>Object.prototype.hasOwnProperty.call(value,key));
 return false;
}

export function validateToolArguments(kind:string,name:string,args:unknown){
 const spec=worldTools.find(entry=>entry.name===name);
 if(!spec||(kind==='review'?!reviewTools.includes(name):!spec.roles.includes(kind)))throw new Error('Tool is unavailable for this stage: '+name);
 if(!matches(args,spec.inputSchema))throw new Error('Invalid arguments for '+name+'. Follow its schema; unknown fields and invalid paths are rejected.');
 const value=args as any;
 if(name==='world_edit'){
  if(value.action==='insert'&&(value.key===undefined||typeof value.source!=='string'))throw new Error('Insert requires key and JSON source.');
  if(value.action==='replace'&&typeof value.source!=='string')throw new Error('Replace requires JSON source.');
  if(value.action==='remove'&&(value.source!==undefined||value.key!==undefined)||value.action==='replace'&&value.key!==undefined)throw new Error('Arguments do not match the edit action.');
 }
 return spec;
}

export function canonicalToolRequest(name:string,args:any):string {
 let nodes=0;
 function stable(value:any,depth=0):string {
  if(++nodes>100000||depth>20)throw new Error('Tool arguments exceed nesting or node limits.');
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(entry=>stable(entry,depth+1)).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key],depth+1)).join(',')+'}';
  throw new Error('Tool arguments must be JSON values.');
 }
 const request=stable({name,args});if(request.length>9*1024*1024)throw new Error('Tool arguments exceed 9 MiB characters.');return request;
}

export function schemaCoverage(source:string,references:any[]){
 try{
 const root=doc.parse(source),base=doc.statePath(root),world=doc.at(root,base),versionNode=world.children.find(child=>child.key==='heroesVersion')?.node;
 const version=versionNode?.kind==='number'?Number(source.slice(versionNode.start,versionNode.end)):null;
 const selected=doc.selectReferences(source,references),expected=referenceVersion(selected);
 return {version,schemaVersion:expected,coverage:expected!==null&&expected===version?'matched':selected.length?'advisory':'unavailable',sections:selected.map(entry=>entry.section),environment:'unverified',official:false};
 }catch{return {version:null,schemaVersion:null,coverage:'unavailable',sections:[],environment:'unverified',official:false};}
}

export function executeWorldTool(project:Project,task:Task,name:string,args:any,references:any[],proposalId:string,hasher:(text:string)=>string):{result:any;command?:any}{
 validateToolArguments(task.kind,name,args);
 if(task.kind==='review'&&args.path&&!task.delegation?.paths.some(path=>path.every((key,index)=>args.path[index]===key)))throw new Error('Read path is outside the delegated scope.');
 if(name==='delegate_review'&&!taskToolCapabilities(task).delegation)throw new Error('Delegation was not approved for this task.');
 const source=task.kind==='work'?task.stagedSource:task.baseSource;
 switch(name){
  case 'creation_read':{
   if(!project.creation)throw new Error('No source-to-world creation workspace is configured.');
   if(args.section==='readiness'){
    const report=creationReadiness(project.creation,source,references,hasher),offset=args.offset||0;
    return {result:{...report,inventory:{...report.inventory,excluded:report.inventory.excluded.slice(offset,offset+20).map(item=>({...item,reason:item.reason.slice(0,1000)}))},gates:report.gates.map((gate:any)=>({...gate,reason:gate.reason.slice(0,1000),defects:gate.defects.slice(offset,offset+20)})),defects:report.defects.slice(offset,offset+20),blockers:report.blockers.slice(offset,offset+20),pending:report.pending.slice(offset,offset+20).map(({id,kind,label})=>({id,kind,label})),offset,nextOffset:Math.max(report.defects.length,report.blockers.length,report.pending.length,report.inventory.excluded.length)>offset+20?offset+20:null}};
   }
   if(args.section==='destinations'){const destinations=creationDestinations(source).filter(destination=>destination.target),offset=args.offset||0;return {result:{destinations:destinations.slice(offset,offset+20).map(({id,label,category,target,url,context})=>({id,label,category,target,hasArtwork:!!url,context:context.slice(0,600)})),offset,nextOffset:offset+20<destinations.length?offset+20:null,total:destinations.length}};}
   return {result:readCreation(project.creation,args.section,args.offset||0,hasher)};
  }
  case 'creation_update':{
   if(!project.creation||task.creationId!==project.creation.id||task.creationBriefHash!==creationBriefHash(project.creation,hasher))throw new Error('This task has no approved creation brief.');
   return {result:{recorded:true,section:args.section,localOnly:true,published:false},command:{type:'taskCreationUpdate',section:args.section,source:args.source}};
  }
  case 'world_read':{const raw=doc.read(source,args.path);if(raw.length>100000)throw new Error('Read a smaller path using world_children.');return {result:{source:raw}};}
  case 'world_children':{const node=doc.describe(source,args.path);return {result:{kind:node.kind,children:node.children.slice(0,500),truncated:node.children.length>500}};}
  case 'world_search':return {result:doc.search(source,args.query)};
  case 'world_validate':return {result:doc.validate(source,references)};
  case 'world_schema':return {result:doc.schemaGuidance(source,references,args.section)};
  case 'world_notes':return {result:readBuilderNotes(task.builderNotes||[],args.path,args.offset||0)};
  case 'world_reference_impact':return {result:referenceImpact(source,args.path,args.direction||'all',args.offset||0,args.limit||40)};
  case 'world_diff':return {result:doc.diff(task.baseSource,source,100,args.offset||0)};
  case 'world_schema_coverage':return {result:schemaCoverage(source,references)};
  case 'world_readiness':return {result:readiness({...project,activeSource:source},references,hasher(source))};
  case 'world_edit':return {result:{staged:true,activeWorldUnchanged:true},command:{...args,type:'taskEdit'}};
  case 'delegate_review':return {result:{taskId:proposalId,pending:true,readOnly:true},command:{type:'delegateTask',id:proposalId,objective:args.objective,paths:args.paths}};
  case 'record_note_plan':return {result:{recorded:true,awaitingHumanReview:true},command:{...args,type:'recordNotePlan'}};
  case 'propose_artwork':return {result:{proposalId,awaitingHumanApproval:true,activeWorldUnchanged:true,generated:false},command:{type:'proposeArtwork',id:proposalId,request:args}};
  case 'propose_work_order':return {result:{proposalId,awaitingHumanApproval:true,activeWorldUnchanged:true},command:{type:'proposeWorkOrder',id:proposalId,order:args}};
  default:throw new Error('Unknown world tool.');
 }
}

export interface CompletionEvidence {sourceHash:string;baseHash:string;schemaHash:string;coverage:string;schemaVersion:number|null;environment:string;state:'pass'|'blocked'|'review';errors:doc.Issue[];warnings:number;scopeChecked:boolean;created:number;official:false}
export function completionEvidence(task:Task,references:any[],hasher:(text:string)=>string,now:number):CompletionEvidence {
 const source=task.stagedSource,coverage=schemaCoverage(source,references),issues=doc.validate(source,references),errors=issues.filter(issue=>issue.level==='error');
 let scopeChecked=true;
 try{
  if(hasher(task.baseSource)!==task.baseHash)throw new Error('Task-start source hash does not match its snapshot.');
  doc.assertPackageMetadataUnchanged(task.baseSource,source);
  const diff=doc.diff(task.baseSource,source,2000,0);scopeChecked=diff.total<=2000;
  if(scopeChecked&&task.workOrder.allowedPaths.length)for(const change of diff.changes)if(!task.workOrder.allowedPaths.some(path=>path.every((key,index)=>change.path[index]===key)))errors.push({level:'error',path:change.path,message:'Change is outside the approved Work Order scope.'});
 }catch(error){errors.push({level:'error',path:[],message:(error as Error).message});}
 return {sourceHash:hasher(source),baseHash:task.baseHash,schemaHash:hasher(JSON.stringify(doc.selectReferences(source,references))),coverage:coverage.coverage,schemaVersion:coverage.schemaVersion,environment:coverage.environment,state:errors.length?'blocked':coverage.coverage==='matched'&&scopeChecked?'pass':'review',errors:errors.slice(0,100),warnings:issues.filter(issue=>issue.level==='warning').length,scopeChecked,created:now,official:false};
}
