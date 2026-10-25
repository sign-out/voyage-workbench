export function voyageRetryAfter(value:string|null,now=Date.now()):number|undefined {
  if(value===null)return undefined;
  const trimmed=value.trim();
  if(/^\d+$/.test(trimmed)){const delay=Number(trimmed)*1000;return Number.isSafeInteger(delay)&&delay<=8640000000000000-now?delay:Infinity;}
  if(!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed))return Infinity;
  const date=Date.parse(trimmed);
  return Number.isFinite(date)&&new Date(date).toUTCString()===trimmed?Math.max(0,date-now):Infinity;
}

export function voyageReadRetry(method:string,status:number,code:string,attempt:number,retryAfter:number|undefined):number|undefined {
  if(method!=='GET'||attempt>=2||['request_status_unknown','request_in_progress','studio_version_mismatch'].includes(code))return undefined;
  if(![0,408,429,500,502,503,504].includes(status))return undefined;
  if(status===429&&retryAfter===undefined)return undefined;
  const delay=retryAfter??500*2**attempt;
  return Number.isFinite(delay)&&delay<=5000?delay:undefined;
}

export function voyageFailureGuidance(status:number,code:string,method:string):string {
  if(code==='request_status_unknown')return 'The remote action may have completed. Reconcile the live world and Studio state before retrying; keep the original request key.';
  if(code==='request_in_progress')return 'The original request is still protected. Wait before an exact retry using the same request key; do not start a replacement request.';
  if(code==='studio_version_mismatch')return 'Do not change version fields or retry on another host. Open the world in the selected environment’s Creator Studio to confirm an upgrade, or explicitly choose a compatible environment for a newer draft.';
  if(code==='studio_unavailable')return 'Voyage Studio is temporarily unavailable; this is a clean availability rejection. Retry the unchanged request after the cooldown. If it persists, contact Voyage support with the request ID.';
  if(status===401)return 'Reconnect a current Creator API key for this environment in Connections, then retry. Local editing remains available.';
  if(status===403&&code!=='creator_api_access_required')return 'Check key scopes, world ownership and Creator API access for this environment. Local editing remains available.';
  if(status===412||status===428||code==='invalid_revision')return 'Download the current draft as a proposal, review and merge it, then save with its current revision. Do not blindly resend the old full replacement.';
  if(status===429)return 'Voyage is rate limited. Wait for the indicated cooldown or daily-limit reset before retrying the same unchanged request; do not create a new key to bypass the limit.';
  if(status===404)return 'Refresh owned worlds and check the world ID, ownership and selected environment. Existing project links are not automatically retargeted.';
  if(method!=='GET'&&status>=500)return 'The write outcome may be uncertain. Reconcile the remote state before retrying; do not start a replacement request.';
  return '';
}

export function voyageCleanRejection(status:number,code:string):boolean {
  if(['request_status_unknown','request_in_progress'].includes(code))return false;
  return code==='studio_unavailable'||code==='studio_version_mismatch'||[400,401,403,404,405,412,413,415,422,428,429].includes(status);
}
