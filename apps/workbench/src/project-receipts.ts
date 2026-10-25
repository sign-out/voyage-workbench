export function isCurrentProjectReceipt(receipt:{project?:{id:string};revision?:number},requested:{id:string;generation:number},current:{id?:string;generation:number;revision:number}){
 return receipt.project?.id===requested.id&&current.id===requested.id&&requested.generation===current.generation&&typeof receipt.revision==='number'&&Number.isSafeInteger(receipt.revision)&&receipt.revision>=current.revision;
}
