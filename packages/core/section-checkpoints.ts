import * as doc from './document';
import references from './work-validation.json';

export interface SectionCheckpoint {id:string;sequence:number;label:string;paths:doc.Path[];sourceHash:string;preexistingErrors:number}
const within=(path:doc.Path,parent:doc.Path)=>parent.every((key,index)=>path[index]===key);
export function sectionCheckpointPaths(input:unknown,allowed:doc.Path[],authored:doc.Path):doc.Path[] {
 if(!Array.isArray(input)||!input.length||input.length>20)throw new Error('Checkpoint one section or an atomic dependency group of at most 20 paths.');
 const paths:doc.Path[]=[];
 for(const value of input){
  if(!Array.isArray(value)||value.length>100||value.some(key=>typeof key!=='string'&&(typeof key!=='number'||!Number.isSafeInteger(key)||key<0)))throw new Error('Checkpoint paths must contain strings or nonnegative integer keys.');
  if(!allowed.some(parent=>within(value,parent)))throw new Error('Checkpoint path is outside the approved Work Order scope.');
  if(value.length<=authored.length)throw new Error('Choose individual authored sections, not the whole-world root, for a checkpoint.');
  if(!paths.some(path=>JSON.stringify(path)===JSON.stringify(value)))paths.push(value.slice());
 }
 return paths;
}
export function validateSectionCheckpoint(before:string,after:string,paths:doc.Path[],last?:SectionCheckpoint){
 const changes:doc.Path[]=[];
 function changed(path:doc.Path){if(changes.length>=10000)throw new Error('Checkpoint change group is too large. Use smaller sections.');changes.push(path);}
 function walk(previous:doc.Node,next:doc.Node,path:doc.Path){
  if(before.slice(previous.start,previous.end)===after.slice(next.start,next.end))return;
  if(previous.kind==='array'&&next.kind==='array'&&previous.children.length===next.children.length){previous.children.forEach((child,index)=>walk(child.node,next.children[index].node,path.concat(index)));return;}
  if(previous.kind==='object'&&next.kind==='object'){
   const oldKeys=previous.children.map(child=>child.key),newKeys=next.children.map(child=>child.key);
   const oldNodes:Record<string,doc.Node>=Object.create(null),newNodes:Record<string,doc.Node>=Object.create(null);
   previous.children.forEach(child=>oldNodes[String(child.key)]=child.node);next.children.forEach(child=>newNodes[String(child.key)]=child.node);
   if(JSON.stringify(oldKeys.filter(key=>!!newNodes[String(key)]))!==JSON.stringify(newKeys.filter(key=>!!oldNodes[String(key)])))changed(path);
   previous.children.forEach(child=>{const match=newNodes[String(child.key)];if(match)walk(child.node,match,path.concat(child.key));else changed(path.concat(child.key));});
   next.children.filter(child=>!oldNodes[String(child.key)]).forEach(child=>changed(path.concat(child.key)));return;
  }
  if(previous.kind!==next.kind||previous.kind==='number'||previous.value!==next.value||previous.kind==='array')changed(path);
 }
 walk(doc.parse(before),doc.parse(after),[]);
 if(!changes.length)throw new Error('No changed section is ready to checkpoint.');
 if(changes.some(path=>!paths.some(parent=>within(path,parent))))throw new Error('Checkpoint must include every changed section since the last checkpoint. Include approved dependencies as one atomic group.');
 doc.assertPackageMetadataUnchanged(before,after);
 const baseline=doc.validate(before,references).filter(issue=>issue.level==='error');
 const remaining=baseline.slice();
 const errors=doc.validate(after,references).filter(issue=>issue.level==='error');
 const introduced=errors.filter(issue=>{const index=remaining.findIndex(previous=>JSON.stringify(previous.path)===JSON.stringify(issue.path)&&previous.message===issue.message);if(index<0)return true;remaining.splice(index,1);return false;});
 if(introduced.length)throw new Error('Section checkpoint failed after '+(last?'checkpoint '+last.sequence+' ('+last.label+')':'the task baseline')+'. Suspect changed group: '+paths.map(doc.label).join(', ')+'. New validation errors: '+introduced.slice(0,10).map(issue=>doc.label(issue.path)+': '+issue.message).join('; ')+'. '+baseline.length+' pre-existing error(s) are tracked separately. Fix this group and approved dependencies; preserve completed groups. The failed staged draft and last checkpoint remain available.');
 return {preexistingErrors:errors.length};
}
