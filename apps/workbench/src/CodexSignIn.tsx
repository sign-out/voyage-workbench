import React,{useEffect,useRef,useState} from 'react';
import {codexLoginActive,codexLoginFinish,type CodexLogin} from '../../../packages/core/codex-login';
import {request,platform} from './host';

export function CodexSignIn({initialAuth,onStatus}:{initialAuth?:any;onStatus?:(status:any)=>void}){
 const [auth,setAuth]=useState<any>(initialAuth||null),[login,setLogin]=useState<CodexLogin|null>(initialAuth?.login||null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),mounted=useRef(false),verified=useRef(''),statusCallback=useRef(onStatus);statusCallback.current=onStatus;
 const active=codexLoginActive(login),cleanup=!!login?.busy;
 function receive(value:any){setAuth(value);setLogin(value.login||null);statusCallback.current?.(value);}
 async function refresh(){const ticket=++generation.current;setBusy(true);setError('');try{const next=await request('auth');if(mounted.current&&ticket===generation.current)receive(next);}catch(failure){if(mounted.current&&ticket===generation.current)setError((failure as Error).message);}finally{if(mounted.current&&ticket===generation.current)setBusy(false);}}
 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;generation.current++;};},[]);
 useEffect(()=>{
  if(!active&&!cleanup)return;
  let disposed=false,inFlight=false;
  const poll=async()=>{if(inFlight)return;inFlight=true;const ticket=generation.current;try{
   const next=await request('loginStatus');if(disposed||!mounted.current||ticket!==generation.current)return;
   setLogin(next);setError('');
   if(next?.state==='complete'&&verified.current!==next.attempt){verified.current=next.attempt;const checked=await request('auth');if(mounted.current&&ticket===generation.current)receive(checked);}
  }catch(failure){if(!disposed&&mounted.current&&ticket===generation.current)setError('Could not read sign-in progress: '+(failure as Error).message);}finally{inFlight=false;}};
  const timer=setInterval(()=>void poll(),1000),focus=()=>void poll();window.addEventListener('focus',focus);void poll();
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',focus);};
 },[login?.attempt,login?.state,cleanup]);
 async function action(method:'login'|'loginCancel'|'logout'|'useCliLogin'){
  if(busy)return;
  if(method==='logout'&&!window.confirm('Sign out of the Codex CLI credentials used by Workbench? This does not manage or revoke other apps’ sessions. Finish Codex work first.'))return;
  const ticket=++generation.current;setBusy(true);setError('');
  const attempt=login?.attempt;
  if(method==='loginCancel'&&login)setLogin(codexLoginFinish(login,'canceled'));
  try{
   const response=await request(method,method==='loginCancel'?{attempt}:{});
   if(!mounted.current||ticket!==generation.current)return;
   if(method==='login'||method==='loginCancel'){
    setLogin(response);
    if(response?.state==='complete'){verified.current=response.attempt;const checked=await request('auth');if(mounted.current&&ticket===generation.current)receive(checked);}
   }else if(method==='useCliLogin')receive(response);
   else{const checked=await request('auth');if(mounted.current&&ticket===generation.current)receive(checked);}
  }catch(failure){if(mounted.current&&ticket===generation.current)setError((failure as Error).message);}finally{if(mounted.current&&ticket===generation.current)setBusy(false);}
 }
 return <section className="connection-card" aria-label="Codex sign-in" aria-busy={busy||active}>
  <div className="eyebrow">CODEX CLI · SHARED SIGN-IN</div><h2>Codex subscription</h2>
  <p>All Workbench Codex connections, model checks, assistant work and artwork use the same saved CLI sign-in. We check for and reuse existing authentication before requesting any new device-code login.</p>
  <p role="status">{busy&&!active?'Checking Codex sign-in…':active?login?.state==='starting'?'Checking existing authentication before requesting a code…':login?.state==='verifying'?'Verifying the saved Codex account…':'Waiting for you to finish Codex sign-in. No new code will be requested automatically.':auth?.account?'Signed in'+(auth.account.email?' · '+auth.account.email:' · '+auth.account.type):auth?.requiresOpenaiAuth===false?'The current CLI provider does not require OpenAI sign-in.':auth?.error?'Sign-in status unavailable. Refresh status; this does not mean your saved sign-in is gone.':auth?'Not signed in':'Checking sign-in…'}</p>
  <div className="button-row">
   <button className="primary" disabled={busy||active||cleanup||!!auth?.account||auth?.requiresOpenaiAuth===false||auth?.available!==true} onClick={()=>void action('login')}>Sign in to Codex</button>
   {platform!=='android'&&<button disabled={busy||active||cleanup||!!auth?.account} onClick={()=>void action('useCliLogin')}>Reuse existing CLI login</button>}
   <button disabled={busy} onClick={()=>void refresh()}>Refresh status</button>
   {auth?.account&&<button disabled={busy||active||cleanup} onClick={()=>void action('logout')}>Sign out of Workbench Codex</button>}
  </div>
  {login?.state==='waiting'&&login.verificationUrl&&login.userCode&&<div className="login-box" role="status"><p>Open the official sign-in page and enter this code:</p><strong>{login.userCode}</strong><div className="button-row"><button onClick={()=>void request('copyText',{text:login.userCode}).catch(failure=>setError(failure.message))}>Copy code</button><button onClick={()=>void request('openExternal',{url:login.verificationUrl}).catch(failure=>setError(failure.message))}>Open Codex sign-in page</button></div><p>Return here after approving; status updates automatically. Device-code login must be enabled in your ChatGPT account or workspace security settings.</p></div>}
  {active&&<button disabled={busy} onClick={()=>void action('loginCancel')}>Cancel this sign-in</button>}
  {cleanup&&!active&&<p role="status">Closing the previous Codex sign-in process before another attempt…</p>}
  {login?.state==='complete'&&<p role="status">{login.reused?'Existing Codex connection reused. No new device-code login was requested.':'Codex sign-in saved. No further login is needed for other Workbench Codex connections.'}</p>}
  {login?.state==='canceled'&&<p role="status">Sign-in canceled. Existing saved credentials were not removed.</p>}
  {(error||auth?.error||!auth?.account&&login?.error)&&<p role="alert">{error||auth?.error||login?.error}</p>}
  {auth?.account&&login?.error&&<details><summary>Previous sign-in attempt</summary><p>{login.error}</p></details>}
  <p className="muted">OpenAI enforces active-session limits. Refreshing status and canceling this pending login do not create another sign-in or revoke sessions in other apps. Workbench cannot list or revoke those other sessions. A session-limit response never triggers automatic re-login, logout or an API fallback.</p>
  {platform!=='android'&&<p className="muted">Reusing a desktop CLI login explicitly copies its file-based credential cache into Workbench’s isolated store; it does not request another login. System-keychain-only CLI credentials cannot be imported this way. An existing Workbench sign-in is kept instead of overwriting it with an older copy.</p>}
 </section>;
}
