import {Capacitor,registerPlugin} from '@capacitor/core';
declare global {interface Window {voyage?:{invoke:(method:string,payload:any)=>Promise<any>}}}
const native=registerPlugin<{request:(args:any)=>Promise<{result:any}>}>('Workbench');
export const platform=Capacitor.isNativePlatform()?'android':typeof window!=='undefined'&&window.voyage?'desktop':'browser';
export async function request(method:string,payload:any={}):Promise<any>{
 if(window.voyage)return window.voyage.invoke(method,payload);
 if(Capacitor.isNativePlatform())return (await native.request({method,payload})).result;
 if(method==='copyText'){if(typeof payload.text!=='string')throw new Error('Clipboard text must be a string.');await navigator.clipboard.writeText(payload.text);return {copied:true};}
 if(method==='openExternal'){window.open(payload.url,'_blank','noopener');return {};}
 if(method==='exportMedia'){const match=/^data:(image\/(png|jpeg|webp)|audio\/(mpeg|wav|ogg|mp4));base64,([A-Za-z0-9+/]*={0,2})$/.exec(payload.dataUrl);if(!match)throw new Error('Unsupported media.');const bytes=Uint8Array.from(atob(match[3]),character=>character.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:match[1]}));const link=document.createElement('a');link.href=url;link.download=payload.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return {saved:true};}
 if(method==='exportImage'){const a=document.createElement('a');a.href=payload.dataUrl;a.download=payload.name;a.click();return {saved:true};}
 if(method==='export'){const url=URL.createObjectURL(new Blob([payload.source],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=payload.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return {saved:true};}
 const res=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','x-voyage-client':'1'},body:JSON.stringify({method,payload})});const data=await res.json();if(data.error)throw new Error(data.error);return data.result;
}
