import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Rpc} from './codex';
import {codexMediaInput,codexMediaThread,codexImageResult} from '../../packages/core/codex-media';
import type {TaskRoute} from '../../packages/core/providers';

export interface MediaRpc {
 onEvent:(method:string,params:any)=>void;
 init:()=>Promise<any>;
 request:(method:string,params?:any,timeout?:number)=>Promise<any>;
 close:()=>void;
}
export class CodexMedia {
 busy=false;
 constructor(public home:string,public directory:string,public makeRpc:(home:string,cwd:string)=>MediaRpc=(home,cwd)=>new Rpc(home,cwd)){}
 async run(route:TaskRoute,prompt:string,images:{id:string;dataUrl:string}[],generation:boolean){
  if(this.busy)throw new Error('A Codex image request is already running. Wait before starting another.');
  const input=codexMediaInput(prompt,images),cwd=path.join(this.directory,'media-tasks',randomUUID());
  this.busy=true;
  let rpc:MediaRpc|undefined;
  try{
   rpc=this.makeRpc(this.home,cwd);await rpc.init();
   const account=await rpc.request('account/read',{refreshToken:false});
   if(!account.account)throw new Error('Sign into Codex in Connection first.');
   if(generation){const capabilities=await rpc.request('modelProvider/capabilities/read');if(!capabilities.imageGeneration)throw new Error('This Codex connection does not expose image generation. Choose a supported image provider; no API fallback was sent.');}
   const thread=await rpc.request('thread/start',codexMediaThread(cwd,route.model,generation));
   const threadId=thread.thread.id;
   let image:any,text='',settled=false;
   const result=await new Promise<{text:string;image?:ReturnType<typeof codexImageResult>}>((resolve,reject)=>{
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){reject(error);return;}try{resolve({text,...(generation?{image:codexImageResult(image)}:{})});}catch(reason){reject(reason);}};
    const timer=setTimeout(()=>finish(new Error('Codex image request timed out. It may have consumed account usage; retry explicitly.')),10*60*1000);
    rpc!.onEvent=(method,params)=>{
     if(method==='host/exited'){finish(new Error('Codex stopped before returning image results.'));return;}
     if(params.threadId!==threadId)return;
     if(method==='item/completed'&&params.item?.type==='imageGeneration')image=params.item;
     if(method==='item/completed'&&params.item?.type==='agentMessage'){text=params.item.text||text;if(text.length>1024*1024)finish(new Error('Codex image response is too large.'));}
     if(method==='item/agentMessage/delta'){text+=params.delta||'';if(text.length>1024*1024)finish(new Error('Codex image response is too large.'));}
     if(method==='turn/completed'){
      if(params.turn?.status!=='completed'){finish(new Error(params.turn?.error?.message||'Codex image request failed.'));return;}
      for(const item of params.turn.items||[]){if(item.type==='imageGeneration')image=item;if(item.type==='agentMessage')text=item.text||text;}
      if(text.length>1024*1024){finish(new Error('Codex image response is too large.'));return;}
      finish();
     }
    };
    void rpc!.request('turn/start',{threadId,input}).catch(reason=>finish(reason));
   });
   if(!generation&&!result.text.trim())throw new Error('Codex returned no image analysis.');
   return result;
  }finally{try{rpc?.close();}finally{this.busy=false;}}
 }
 async generate(route:TaskRoute,prompt:string,referenceDataUrl?:string){
  const result=await this.run(route,prompt,referenceDataUrl?[{id:'Reference image',dataUrl:referenceDataUrl}]:[],true);
  return {...result.image!,route};
 }
}
