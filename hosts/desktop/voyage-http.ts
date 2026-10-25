import {voyageRetryAfter,voyageReadRetry,voyageFailureGuidance} from '../../packages/core/voyage-api';

export class VoyageHttpError extends Error {
  constructor(public status:number,public code:string,message:string,public requestId:string,public retryAfterMs:number|undefined){super(message);}
}

export async function voyageHttp(url:string,options:RequestInit,runtime:{fetch?:typeof fetch;now?:()=>number;sleep?:(delay:number)=>Promise<void>}={}) {
  const send=runtime.fetch||globalThis.fetch,now=runtime.now||Date.now,sleep=runtime.sleep||((delay:number)=>new Promise<void>(resolve=>setTimeout(resolve,delay)));
  const deadline=now()+45000,signal=AbortSignal.timeout(45000),method=options.method||'GET';
  for(let attempt=0;;attempt++){
    let failure:unknown,delay:number|undefined,response:Response|undefined;
    try{
      response=await send(url,{...options,signal,redirect:'error'});const text=await response.text();
      if(response.ok)return {text,etag:response.headers.get('etag')||''};
      let payload:any;try{payload=JSON.parse(text);}catch{}
      const code=typeof payload?.error?.code==='string'?payload.error.code.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80):'';
      const requestId=typeof payload?.requestId==='string'?payload.requestId.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80):'';
      const message=code==='creator_api_access_required'?'Creator API access is not enabled for this key or account. Enable Creator API access in Voyage, then use a key from Studio → Settings → API keys. If access is already enabled, contact Voyage support with the request ID. Local editing remains available.':typeof payload?.error?.message==='string'?payload.error.message.slice(0,500):'Request rejected.';
      const retryAfter=voyageRetryAfter(response.headers.get('retry-after'),now()),guidance=voyageFailureGuidance(response.status,code,method);
      const cooldown=retryAfter===Infinity?' Voyage supplied an invalid cooldown; check again later.':retryAfter!==undefined?' Retry no earlier than '+new Date(now()+retryAfter).toISOString()+'.':'';
      failure=new VoyageHttpError(response.status,code,'Voyage HTTP '+response.status+(code?' ('+code+')':'')+': '+message+(guidance?' '+guidance:'')+cooldown+(requestId?' Request ID: '+requestId+'.':''),requestId,retryAfter);
      delay=voyageReadRetry(method,response.status,code,attempt,retryAfter);
    }catch(error){
      if(signal.aborted)throw new Error(method==='GET'?'Voyage timed out while reading. Retry the read when the connection is stable.':'Voyage timed out; the write may have completed. Reconcile remote state before retrying.');
      if(response&&!response.ok)throw new Error('Voyage error response could not be read; automatic retry stopped because its safety code and cooldown could not be confirmed. For a write, reconcile remote state before retrying; keep the original request key.');
      if(!(error instanceof TypeError))throw error;
      failure=new Error(method==='GET'?'Could not read Voyage. Check your connection and retry; your local project is safe.':'Connection to Voyage was lost; the write may have completed. Reconcile remote state before retrying; keep the original request key.');
      delay=voyageReadRetry(method,0,'',attempt,undefined);
    }
    if(delay===undefined||signal.aborted||now()+delay>=deadline)throw failure;
    await sleep(delay);
    if(signal.aborted||now()>=deadline)throw failure;
  }
}
