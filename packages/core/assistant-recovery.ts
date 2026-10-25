export interface AssistantRecoverySettings {enabled:boolean;maxAttempts:number}

export function assistantRecoverySettings(input:unknown=undefined):AssistantRecoverySettings {
 if(input===undefined)return {enabled:true,maxAttempts:3};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Assistant recovery settings must be an object.');
 const value=input as Record<string,unknown>;
 if(Object.keys(value).some(key=>!['enabled','maxAttempts'].includes(key)))throw new Error('Unknown assistant recovery setting.');
 const enabled=value.enabled===undefined?true:value.enabled,maxAttempts=value.maxAttempts===undefined?3:value.maxAttempts;
 if(typeof enabled!=='boolean')throw new Error('Assistant recovery enabled must be a boolean.');
 if(typeof maxAttempts!=='number'||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw new Error('Assistant recovery maxAttempts must be an integer from 1 to 10.');
 return {enabled,maxAttempts};
}

export function assistantRecoveryEligible(error:unknown):boolean {
 const message=error instanceof Error?error.message:String(error);
 if(/^(?:Error: )?Section checkpoint failed after /.test(message))return true;
 return !/cancel|abort|timed? out|stopp?ed|interrupt|no longer|attempt.*exist|outside.*scope|frozen.*changed|read.only|unavailable|unapproved|explicitly approve|approved Work Order scope.*malformed|sign.?in|\bauth\b|authentication|authorization|unauthorized|credential|permission|HTTP\s*\d|network|transport|fetch failed/i.test(message);
}

export class AssistantRecoveryBudget {
 readonly settings:AssistantRecoverySettings;
 private used=0;
 get attempts(){return this.used;}
 constructor(settings?:AssistantRecoverySettings){this.settings=assistantRecoverySettings(settings);}
 correctiveOpportunity(error:unknown){
  const reason=error instanceof Error?error.message:String(error);
  if(!assistantRecoveryEligible(error))throw error;
  if(!this.settings.enabled)throw new Error('Assistant recovery is disabled. Review the failure and restart explicitly: '+reason);
  if(this.attempts>=this.settings.maxAttempts)throw new Error('Assistant recovery exhausted after '+this.attempts+' corrective opportunities. Review partial changes and the approved Work Order, fix the issue, then restart explicitly: '+reason);
  this.used++;
  return {error:reason,recovery:{attempt:this.attempts,maxAttempts:this.settings.maxAttempts,instruction:'Correct this local failure within the existing approved scope. Do not replay remote requests or mutations. No new task is authorized.'}};
 }
 tool<T>(execute:()=>T,ensureRunning:()=>void):T|ReturnType<AssistantRecoveryBudget['correctiveOpportunity']> {
  ensureRunning();
  try{return execute();}catch(error){ensureRunning();return this.correctiveOpportunity(error);}
 }
}
