import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash} from './project';
import {chatPlanContent,chatPlanWorkOrder} from './chat-plans';
test('saved chat plans are local metadata, not world edits or planning tasks',()=>{
 const original=create('world','World','{"title":"Original","exact":9007199254740993}',1);
 const saved=reduce(original,{type:'chatPlan',expectedRevision:0,plan:{title:' Better world ',text:' Add factions.\nPreserve exact numbers. '},now:2});
 assert.deepEqual(saved.chatPlan,{title:'Better world',text:'Add factions.\nPreserve exact numbers.',revision:1,updated:2});
 assert.equal(saved.activeSource,original.activeSource);assert.equal(saved.sourceRevision,0);assert.deepEqual(saved.tasks,[]);assert.deepEqual(saved.chat,[]);assert.deepEqual(saved.workOrder,original.workOrder);assert.equal(original.chatPlan,undefined);
 const restored=JSON.parse(JSON.stringify(saved));assert.deepEqual(restored.chatPlan,saved.chatPlan);
});
test('plan edits use optimistic revisions and never silently overwrite another save',()=>{
 const first=reduce(create('world','World','{}',1),{type:'chatPlan',expectedRevision:0,plan:{title:'Plan',text:'First'}});
 assert.throws(()=>reduce(first,{type:'chatPlan',expectedRevision:0,plan:{title:'Plan',text:'Stale'}}),/changed/);
 for(const expectedRevision of [undefined,-1,NaN,1.5,'1'])assert.throws(()=>reduce(first,{type:'chatPlan',expectedRevision,plan:{title:'Plan',text:'Bad'}}));
 const next=reduce(first,{type:'chatPlan',expectedRevision:1,plan:{title:'Revised',text:'Second'}});assert.equal(next.chatPlan?.revision,2);assert.equal(first.chatPlan?.text,'First');
});
test('invalid or oversized plan content fails without changing the project',()=>{
 for(const plan of [null,{},[],{title:'',text:'x'},{title:'x',text:' '},{title:'x'.repeat(201),text:'x'},{title:'x',text:'x'.repeat(100001)},{title:'x',text:123}])assert.throws(()=>chatPlanContent(plan));
 assert.deepEqual(chatPlanContent({title:'<script>',text:'**literal plan**'}),{title:'<script>',text:'**literal plan**'});
});
test('build handoff includes only the reviewed plan, with no inherited scope or approval',()=>{
 const plan={title:'Improve factions',text:'Keep the map.\n\nAdd rivals.',revision:1,updated:2};
 const order=chatPlanWorkOrder(plan);assert.deepEqual(order,{objective:'Improve factions',requirements:['Keep the map.','Add rivals.'],allowedPaths:[],wholeWorld:false});
 const project=create('world','World','{"title":"World"}',1);
 assert.throws(()=>reduce(project,{type:'workOrder',baseHash:hash(project.activeSource),order:{...order,reviewedScope:true}}),/Select/);
 for(const text of [Array(101).fill('Line').join('\n'),'x'.repeat(10001)])assert.throws(()=>chatPlanWorkOrder({...plan,text}),/shorten the plan/);
});
