export interface CursorRequest {
 operation:'status'|'login'|'turn'|'models';
 key?:string;
 credentials?:{apiKey:string;apiKeyExpiresAtMs?:number};
 context?:string;
 model?:string;
}

export function cursorKey(request:CursorRequest){
 const credentials=request.credentials;
 const key=request.key||((credentials?.apiKeyExpiresAtMs===undefined||credentials.apiKeyExpiresAtMs>Date.now())?credentials?.apiKey:'');
 if(!key)throw new Error('Sign in with Cursor or add a Cursor user API key.');
 return key;
}
export function cursorOptions(request:CursorRequest,cwd:string){
 const key=cursorKey(request);
 if(!request.model?.trim())throw new Error('Choose an explicit Cursor model in Models & agents before starting a task.');
 if(typeof request.context!=='string'||Buffer.byteLength(request.context)>8*1024*1024)throw new Error('Invalid Cursor task context.');
 const context=JSON.parse(request.context);
 if(typeof context.system!=='string'||!context.system.trim())throw new Error('Invalid Cursor system instructions.');
 return {apiKey:key,local:{cwd,settingSources:[],enableAgentRetries:false},tools:[],mcpServers:{},agents:{},systemPrompt:context.system,model:{id:request.model}};
}

export function cursorLoginUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='cursor.com'||url.port||url.username||url.password||url.pathname!=='/loginDeepControl')throw new Error('Unexpected Cursor sign-in URL.');
 return value;
}

export async function cursorOperation(sdk:any,request:CursorRequest,cwd:string,emit:(event:any)=>void,signal:AbortSignal){
 if(request.operation==='status'){
  const credentials=request.credentials;
  const loggedIn=!!request.key||!!credentials?.apiKey&&(credentials.apiKeyExpiresAtMs===undefined||credentials.apiKeyExpiresAtMs>Date.now());
  emit({type:'status',loggedIn,authMethod:request.key?'api-key':loggedIn?'cursor-account':'none'});
  return;
 }
 if(request.operation==='login'){
  const result=await sdk.Cursor.auth.login({openBrowser:false,store:null,signal,apiKeyName:'Voyage Workbench Android',onLoginUrl:(url:string)=>emit({type:'login-url',url:cursorLoginUrl(url)})});
  if(signal.aborted)throw new Error('Sign-in canceled.');
  if(typeof result.apiKey!=='string'||!result.apiKey||!Number.isFinite(result.apiKeyExpiresAtMs)||result.apiKeyExpiresAtMs<=Date.now())throw new Error('Cursor returned invalid credentials.');
  emit({type:'login-complete',credentials:{apiKey:result.apiKey,apiKeyExpiresAtMs:result.apiKeyExpiresAtMs}});
  return;
 }
 if(request.operation==='models'){
  if(signal.aborted)throw new Error('Model discovery canceled.');
  const models=await sdk.Cursor.models.list({apiKey:cursorKey(request),signal});
  if(signal.aborted)throw new Error('Model discovery canceled.');
  emit({type:'models',models});return;
 }
 if(request.operation!=='turn')throw new Error('Unsupported Cursor operation.');
 const options=cursorOptions(request,cwd);
 if(signal.aborted)throw new Error('Task canceled.');
 const agent=await sdk.Agent.create(options);
 let run:any;
 const cancel=()=>{void run?.cancel().catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{
  if(signal.aborted)throw new Error('Task canceled.');
  run=await agent.send(request.context);
  if(signal.aborted){cancel();throw new Error('Task canceled.');}
  const result=await run.wait();
  if(signal.aborted||result.status!=='finished'||typeof result.result!=='string')throw new Error('Cursor did not complete the turn.');
  emit({type:'turn-complete',result:result.result});
 }finally{signal.removeEventListener('abort',cancel);agent.close();}
}
