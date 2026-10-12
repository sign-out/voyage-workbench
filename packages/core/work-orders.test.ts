import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash} from './project';
import {proposedOrder} from './work-orders';
import {toolDefinitions} from './providers';
const source='{"shortId":"fixed","initialGameState":{"npcs":{"mara":{"name":"Mara","hpMax":9007199254740993}}}}';
const order={objective:'Improve Mara',requirements:['Keep her identity'],allowedPaths:[['initialGameState','npcs','mara']]};
function planning(){return reduce(reduce(create('p','World',source,1),{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',prompt:'Improve Mara'}),{type:'taskRunning',taskId:'task',attempt:'attempt'});}
const proposal=(id='proposal')=>({type:'proposeWorkOrder',taskId:'task',attempt:'attempt',id,order});
test('planner proposes durable structured work without editing or approving',()=>{
 const before=planning(),after=reduce(before,proposal());
 assert.equal(after.activeSource,source);assert.deepEqual(after.workOrder,before.workOrder);assert.equal(after.tasks[0].state,'RUNNING');assert.equal(before.workOrderProposals,undefined);
 assert.deepEqual(after.workOrderProposals?.[0].order.allowedPaths,order.allowedPaths);
 const restored=JSON.parse(JSON.stringify(reduce(after,{type:'taskDone',taskId:'task',attempt:'attempt',text:'Suggested'})));
 assert.equal(restored.workOrderProposals[0].baseHash,hash(source));assert.equal(restored.tasks[0].baseSource,'');
 assert.equal(reduce(restored,{type:'dismissWorkOrderProposal',id:'proposal'}).workOrderProposals?.length,0);
 assert.equal(restored.workOrderProposals.length,1);
});
test('proposal scope must be existing authored content with explicit whole-world permission',()=>{
 for(const allowedPaths of [[],[[]],[['initialGameState']],[['shortId']],[['initialGameState','npcs','missing']],[['initialGameState',-1]],[['initialGameState',1.5]],[['initialGameState',true]]])assert.throws(()=>proposedOrder(source,{...order,allowedPaths}));
 assert.deepEqual(proposedOrder(source,{...order,allowedPaths:[],wholeWorld:true}).allowedPaths,[['initialGameState']]);
 assert.throws(()=>proposedOrder(source,{...order,wholeWorld:true}),/not both/);
 assert.deepEqual(proposedOrder(source,{...order,allowedPaths:[...order.allowedPaths,...order.allowedPaths]}).allowedPaths,order.allowedPaths);
});
test('malformed proposals fail rather than coercing or truncating',()=>{
 for(const input of [null,[],{}, {...order,objective:42},{...order,objective:' '},{...order,requirements:['']},{...order,requirements:'keep it'},{...order,wholeWorld:'true'},{...order,unexpected:true}])assert.throws(()=>proposedOrder(source,input));
});
test('stopped, stale and wrong-attempt planners cannot propose',()=>{
 const before=planning();assert.throws(()=>reduce(before,{...proposal(),attempt:'old'}));assert.throws(()=>reduce(before,{...proposal(),attempt:undefined}));
 assert.throws(()=>reduce(reduce(before,{type:'taskStop',taskId:'task'}),proposal()),/planning attempt/);
 const changed=reduce(before,{type:'edit',baseHash:hash(source),path:['initialGameState','npcs','mara','name'],source:'"Changed"'});
 assert.throws(()=>reduce(changed,proposal()),/world changed/);
 assert.throws(()=>reduce(reduce(before,proposal()),proposal()),/unique/);
});
test('work tasks cannot propose orders and broad proposals still protect metadata',()=>{
 let project=reduce(create('p','World',source,1),{type:'workOrder',order:proposedOrder(source,{...order,allowedPaths:[],wholeWorld:true})});
 project=reduce(reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'work'}),{type:'taskRunning',taskId:'task',attempt:'attempt'});
 assert.throws(()=>reduce(project,proposal()),/planning attempt/);
 assert.throws(()=>reduce(project,{type:'taskEdit',taskId:'task',path:['shortId'],source:'"changed"'}),/scope/);
});
test('planning and building have distinct tool capabilities',()=>{
 const plan=toolDefinitions(false),work=toolDefinitions(true);
 assert(plan.some(tool=>tool.name==='propose_work_order'));assert(!plan.some(tool=>tool.name==='world_edit'));
 assert(work.some(tool=>tool.name==='world_edit'));assert(!work.some(tool=>tool.name==='propose_work_order'));
 assert.equal(plan.find(tool=>tool.name==='propose_work_order')?.inputSchema.additionalProperties,false);
});
test('structured suggestions survive more than fifteen completed planning tasks',()=>{
 let project=planning();for(let index=0;index<20;index++){
  if(index)project=reduce(reduce(project,{type:'prepareTask',id:'task',attempt:'attempt-'+index,kind:'plan'}),{type:'taskRunning',taskId:'task',attempt:'attempt-'+index});
  project=reduce(project,{...proposal('proposal-'+index),attempt:project.tasks[0].attempt});
  project=reduce(project,{type:'taskDone',taskId:'task',attempt:project.tasks[0].attempt});
 }
 assert.equal(project.workOrderProposals?.length,20);assert.equal(project.workOrderProposals?.[0].id,'proposal-0');
});
