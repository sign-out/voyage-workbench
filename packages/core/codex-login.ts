export type CodexLogin={attempt:string;state:'starting'|'waiting'|'verifying'|'complete'|'failed'|'canceled'|'expired';started:number;updated:number;expiresAt:number;loginId?:string;verificationUrl?:string;userCode?:string;error?:string;busy?:boolean;reused?:boolean};
export const codexLoginLifetime=15*60*1000;
export function codexLoginNeedsAuthentication(response:any){
 if(!response||!Object.prototype.hasOwnProperty.call(response,'account')||response.account!==null&&(typeof response.account!=='object'||Array.isArray(response.account)||typeof response.account.type!=='string'||!response.account.type))throw new Error('Saved Codex authentication could not be verified. No new sign-in session was requested. Refresh status before trying again.');
 return response.account===null&&response.requiresOpenaiAuth!==false;
}
export function codexLoginActive(login:CodexLogin|null|undefined){return !!login&&['starting','waiting','verifying'].includes(login.state);}
export function codexLoginStarting(attempt:string,now=Date.now()):CodexLogin{
 if(typeof attempt!=='string'||!attempt)throw new Error('Codex sign-in requires an attempt ID.');
 return {attempt,state:'starting',started:now,updated:now,expiresAt:now+codexLoginLifetime};
}
export function codexLoginFinish(login:CodexLogin,state:CodexLogin['state'],error='',now=Date.now()):CodexLogin{
 const {verificationUrl,userCode,busy,...retained}=login;
 return {...retained,state,updated:now,...(error?{error:error.slice(0,1000)}:{error:undefined})};
}
export function codexLoginStarted(login:CodexLogin,response:any,now=Date.now()):CodexLogin{
 if(login.state!=='starting')return login;
 const verificationUrl=response?.verificationUrl,userCode=response?.userCode,loginId=response?.loginId;
 if(response?.type!=='chatgptDeviceCode'||typeof loginId!=='string'||!loginId||loginId.length>200||typeof verificationUrl!=='string'||verificationUrl.length>2000||!/^https:\/\/(auth\.openai\.com|chatgpt\.com)\/[A-Za-z0-9_/?=&%+.#~-]*$/.test(verificationUrl)||typeof userCode!=='string'||!/^[A-Za-z0-9-]{1,128}$/.test(userCode))throw new Error('Codex returned an unsupported device sign-in response. Update the Codex runtime; no credentials were imported or API fallback used.');
 return {...login,state:'waiting',loginId,verificationUrl,userCode,updated:now};
}
export function codexLoginEvent(login:CodexLogin,params:any,now=Date.now()):CodexLogin{
 if(login.state!=='waiting'||typeof params?.loginId!=='string'||params.loginId!==login.loginId)return login;
 return params.success===true?codexLoginFinish(login,'verifying','',now):codexLoginFinish(login,'failed',typeof params.error==='string'&&params.error?params.error:'Codex sign-in was not completed. Start a new attempt when ready.',now);
}
export function codexLoginExpire(login:CodexLogin,now=Date.now()):CodexLogin{
 return codexLoginActive(login)&&now>=login.expiresAt?codexLoginFinish(login,'expired','This Workbench sign-in attempt reached its 15-minute limit. Its code is no longer shown. Start sign-in again; existing credentials were not removed.',now):login;
}
