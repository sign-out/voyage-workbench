import {hash,create,reduce,type Project} from '../packages/core/project';
import {createWorkspace,updateCreation,recordCreationRead,worldCreationRubric,type CreationWorkspace} from '../packages/core/world-creation';
import type {CreationMap} from '../packages/core/creation-map';

export const source=JSON.stringify({heroesVersion:37,realms:{realm:{name:'Coast'}},regions:{region:{name:'Coast',realm:'realm',x:0,y:0,images:{map:{imageUrl:''}}}},locations:{town:{name:'Town',region:'region',x:0,y:0,visualTags:['harbour','stone houses','sea wind'],areas:{square:{description:'A market square faces the harbour. A ferry departs from the east quay.',visualTags:['market stalls','stone fountain','ferry quay']}}}},npcs:{guide:{name:'Guide',visualDescription:'A red-haired guide wearing a blue wool coat.'}},storyStarts:{arrival:{name:'Arrival',description:'The ferry docks. Ask the guide for directions or explore the market.'}},locationSettings:{regionSize:100}}).replace('"heroesVersion":37','"heroesVersion":37,"exact":9007199254740993');
export const references=Object.keys(JSON.parse(source)).map(section=>({section,schema:section==='heroesVersion'?{_type:'literal',value:37}:'any',schemaVersion:37}));
export const blueprint:CreationMap={id:'coast',realm:'realm',west:0,north:0,columns:1,rows:1,background:'#e8dfc0',land:'#b6bc86',water:'#648ba4',forest:'#59744d',ink:'#2b3339',features:[{id:'island',kind:'land',points:[[0,0],[1,0],[1,1],[0,1]]},{id:'river',kind:'river',points:[[.1,0],[.2,.3],[.8,1]]},{id:'town',kind:'settlement',points:[[.5,.5]],locationKey:'town',label:'Town'}]};
export function workspace():CreationWorkspace {
 let result=createWorkspace({id:'creation',brief:'Faithfully create the supplied coastal world, including maps and cover.',documents:[{id:'research',name:'research.md',text:'The town is on a coastal island.\nIts guide has red hair and a blue wool coat.'}]},hash);
 result=recordCreationRead(result,'research',0,result.documents[0].text.length);
 result=updateCreation(result,'design',JSON.stringify({tone:'Warm coastal adventure',artDirection:'Flat woodcut shapes, sea-blue and moss-green, red-haired guide in a blue coat',timeframe:'Before the first ferry departs',assumptions:['Connective market activity is an adaptation.'],decisions:[{id:'island',kind:'canon',text:'The town is on an island.',evidence:[{documentId:'research',startLine:1,endLine:1}]}],deliverables:[{id:'island-world',label:'Island, town and guide',decisionIds:['island'],paths:[['realms','realm'],['regions','region'],['locations','town'],['npcs','guide']],status:'built',reason:'Constructed from the supplied source.'}]}),source,hash,1);
 result=updateCreation(result,'publication',JSON.stringify({title:'The Island Ferry',blurb:'Arrive on an island. Meet its guide, explore the market, or catch the next ferry.',description:'A coastal exploration world.',tags:['Adventure']}),source,hash,2);
 result=updateCreation(result,'maps',JSON.stringify([blueprint]),source,hash,3);
 return updateCreation(result,'artwork',JSON.stringify([{id:'cover',destinationId:'creation-cover',prompt:'A distinctive woodcut of the red-haired guide welcoming a traveller at the island ferry quay.'}]),source,hash,4);
}
export function project():Project {return {...create('project','Island',source,1),creation:workspace()};}
export function running():Project {
 let result=project();result=reduce(result,{type:'approveCreation',baseHash:hash(result.activeSource),expectedRevision:result.creation!.revision});
 result=reduce(result,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work',hostPlatform:'desktop',route:{protocol:'openai',model:'fixture'},autoResume:true});
 return reduce(result,{type:'taskRunning',taskId:'task',attempt:'attempt'});
}
export function perfectReview(){return {criteria:worldCreationRubric.criteria.map((criterion:any)=>({id:criterion.id,grade:4,reason:'Synthetic test evidence, not a real-world quality assessment.',paths:[['storyStarts']]})),gates:worldCreationRubric.gates.map((gate:any)=>({id:gate.id,status:'PASS',reason:'Synthetic test evidence.',paths:[['storyStarts']]})),coverDiagnostic:100,titleDiagnostic:100,blurbDiagnostic:100};}
