export function isCurrentProjectReceipt(receipt:{project?:{id:string};revision?:number},requested:{id:string;generation:number},current:{id?:string;generation:number;revision:number}){
 return receipt.project?.id===requested.id&&current.id===requested.id&&requested.generation===current.generation&&typeof receipt.revision==='number'&&Number.isSafeInteger(receipt.revision)&&receipt.revision>=current.revision;
}

export async function runProjectCommand(projectId:string|undefined,generation:number,command:any,dependencies:{current:()=>{id?:string;generation:number;revision:number};invoke:(method:string,payload:any)=>Promise<any>;receive:(receipt:any)=>void}){
 const requested={id:projectId||'',generation},current=dependencies.current();
 if(!projectId||current.id!==projectId||current.generation!==generation)throw new Error('The open project changed. Reopen this action in the current world.');
 const receipt=await dependencies.invoke('command',{id:projectId,command});
 if(!isCurrentProjectReceipt(receipt,requested,dependencies.current()))throw new Error('The action completed for its original project, but its response was not applied because the open world or revision changed. Reopen that world to inspect the saved result.');
 dependencies.receive(receipt);
 return receipt;
}
