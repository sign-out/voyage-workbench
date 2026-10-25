export interface ChatPlan {title:string;text:string;revision:number;updated:number}
export const chatPlanTextLimit=100000;
export function chatPlanContent(value:unknown):Pick<ChatPlan,'title'|'text'> {
 const plan=value as Partial<ChatPlan>|null;
 if(!plan||typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>200)throw new Error('Provide a plan title of 1–200 characters.');
 if(typeof plan.text!=='string'||!plan.text.trim()||plan.text.length>chatPlanTextLimit)throw new Error('Provide plan text of 1–100,000 characters.');
 return {title:plan.title.trim(),text:plan.text.trim()};
}
export function chatPlanWorkOrder(plan:ChatPlan){
 const content=chatPlanContent(plan);
 const requirements=content.text.split('\n').filter(line=>line.trim());
 if(requirements.length>100||requirements.some(line=>line.length>10000))throw new Error('Before building, shorten the plan to at most 100 nonempty lines, each at most 10,000 characters.');
 return {objective:content.title,requirements,allowedPaths:[],wholeWorld:false};
}
