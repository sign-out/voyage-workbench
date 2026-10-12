import * as doc from './document';
export interface WorkOrder {objective:string;requirements:string[];allowedPaths:doc.Path[];wholeWorld?:boolean;sourceProposalId?:string;reviewedScope?:boolean}
export function proposedOrder(source:string,input:unknown):WorkOrder {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a structured Work Order.');
 const order=input as Record<string,unknown>;
 if(Object.keys(order).some(key=>!['objective','requirements','allowedPaths','wholeWorld'].includes(key)))throw new Error('Unknown Work Order field.');
 if(typeof order.objective!=='string'||!order.objective.trim()||order.objective.length>10000)throw new Error('Provide a nonempty objective of at most 10,000 characters.');
 if(!Array.isArray(order.requirements)||order.requirements.length>100||order.requirements.some(value=>typeof value!=='string'||!value.trim()||value.length>10000))throw new Error('Requirements must be at most 100 nonempty strings.');
 if(order.wholeWorld!==undefined&&typeof order.wholeWorld!=='boolean')throw new Error('wholeWorld must be a boolean.');
 if(!Array.isArray(order.allowedPaths)||order.allowedPaths.length>100)throw new Error('Provide at most 100 scope paths.');
 const root=doc.parse(source),authored=doc.statePath(root),paths:doc.Path[]=[];
 if(order.wholeWorld===true&&order.allowedPaths.length)throw new Error('Choose whole-world scope or specific paths, not both.');
 if(order.wholeWorld===true)paths.push(authored);
 else {
  if(!order.allowedPaths.length)throw new Error('Select existing scope paths or explicitly request wholeWorld.');
  for(const path of order.allowedPaths){
   if(!Array.isArray(path)||path.length>100||path.some(key=>typeof key!=='string'&&(typeof key!=='number'||!Number.isSafeInteger(key)||key<0)))throw new Error('Paths must contain strings or nonnegative safe integers.');
   if(path.length<=authored.length||!authored.every((key,index)=>path[index]===key))throw new Error('Select a path inside authored world content; use wholeWorld for its root.');
   doc.at(root,path);
   if(!paths.some(existing=>JSON.stringify(existing)===JSON.stringify(path)))paths.push(path.slice());
  }
 }
 return {objective:order.objective.trim(),requirements:order.requirements.map(value=>value.trim()),allowedPaths:paths,wholeWorld:order.wholeWorld===true};
}
