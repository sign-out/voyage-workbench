export interface OperationProgress {id:number;method:string;label:string;projectId?:string;started:number;finished?:number;state:'running'|'succeeded'|'failed';error?:string}
const operations:OperationProgress[]=[];
const listeners=new Set<()=>void>();
let sequence=0;
const passive=new Set(['project','projects','references','providerSettings','connection','worldEngine','feature','getFeature','featureGet','featureSet','asset','history','compute','orchestrationCapabilities']);
const labels:Record<string,string>={imageGenerate:'Generating image',coverGrade:'Reviewing cover artwork',creationVisualReview:'Reviewing world artwork',saveRemote:'Saving world to Voyage',reconcileSave:'Checking Voyage save',reviewRemoteSave:'Reading Voyage changes',refreshSchema:'Refreshing authoring references',refreshCommunityReferences:'Refreshing community references',startAgent:'Starting model work',stopAgent:'Stopping model work',export:'Exporting JSON',exportMedia:'Exporting artwork or audio'};
function emit(){listeners.forEach(listener=>listener());}
export function beginOperation(method:string,payload:any,activity?:{label:string;projectId?:string}){
 if(passive.has(method)&&!activity)return;
 const operation:OperationProgress={id:++sequence,method,label:activity?.label||labels[method]||method.replace(/([a-z])([A-Z])/g,'$1 $2'),projectId:activity?.projectId||payload?.id,started:Date.now(),state:'running'};
 operations.push(operation);emit();return operation.id;
}
export function finishOperation(id:number|undefined,error?:unknown){
 const operation=operations.find(item=>item.id===id);if(!operation)return;
 const failed=arguments.length>1;operation.finished=Date.now();operation.state=failed?'failed':'succeeded';if(failed)operation.error=(error instanceof Error?error.message:String(error??'Unknown request failure')).slice(0,2000);
 const completed=operations.filter(item=>item.state!=='running');while(completed.length>8){const oldest=completed.shift()!;operations.splice(operations.indexOf(oldest),1);}emit();
}
export function operationSnapshot(){return operations.map(operation=>({...operation}));}
export function subscribeOperations(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function clearCompletedOperations(){for(let index=operations.length-1;index>=0;index--)if(operations[index].state!=='running')operations.splice(index,1);emit();}
