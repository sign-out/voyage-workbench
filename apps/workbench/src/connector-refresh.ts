export const connectorRefreshDelay=1200;
export const connectorStatusMethods=['auth','connection','providerSettings'] as const;
export function scheduleConnectorRefresh(request:(method:string)=>Promise<any>,receive:(method:string,result:any)=>void,failed:(method:string,error:Error)=>void,timers:{set:(callback:()=>void,delay:number)=>any;clear:(timer:any)=>void}={set:(callback,delay)=>setTimeout(callback,delay),clear:timer=>clearTimeout(timer)}){
 let active=true;
 const timer=timers.set(()=>{connectorStatusMethods.forEach(method=>{void Promise.resolve().then(()=>request(method)).then(result=>{if(active)receive(method,result);},error=>{if(active)failed(method,error instanceof Error?error:new Error(String(error)));});});},connectorRefreshDelay);
 return ()=>{active=false;timers.clear(timer);};
}
