import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentProjectReceipt,runProjectCommand} from './project-receipts';
test('late receipts cannot roll back project snapshots or cross workspace generations',()=>{
 const requested={id:'world',generation:4},current={id:'world',generation:4,revision:10};
 for(const revision of [10,11])assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision},requested,current),true);
 for(const revision of [9,undefined,NaN,1.5])assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision},requested,current),false);
 assert.equal(isCurrentProjectReceipt({project:{id:'other'},revision:11},requested,current),false);
 assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision:11},requested,{...current,id:'other'}),false);
 assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision:11},requested,{...current,generation:6}),false);
 assert.equal(isCurrentProjectReceipt({revision:11},requested,current),false);
});
test('project commands remain bound through delayed saves, project switches and newer edits',async()=>{
 let current:{id?:string;generation:number;revision:number}={id:'first',generation:1,revision:10};const calls:any[]=[],received:any[]=[];
 const pending:{resolve:(value:any)=>void;payload:any}[]=[],dependencies={current:()=>current,receive:(receipt:any)=>{received.push(receipt);current={...current,revision:receipt.revision};},invoke:async(method:string,payload:any)=>{calls.push({method,payload});return new Promise(resolve=>pending.push({resolve,payload}));}};
 const saving=runProjectCommand('first',1,{type:'rename',name:'Saved first world'},dependencies);assert.equal(pending[0].payload.id,'first');
 current={id:'second',generation:2,revision:1};pending.shift()!.resolve({project:{id:'first'},revision:11});await assert.rejects(saving,/original project/);assert.equal(received.length,0);assert.equal(current.id,'second');
 await assert.rejects(runProjectCommand('first',1,{type:'remove',path:['npcs']},dependencies),/open project changed/);assert.equal(calls.length,1,'Stale callbacks must not send a mutation to the new world');
 const older=runProjectCommand('second',2,{type:'rename',name:'Earlier name'},dependencies),newer=runProjectCommand('second',2,{type:'rename',name:'Latest name'},dependencies);
 const earlier=pending.shift()!,latest=pending.shift()!;latest.resolve({project:{id:'second'},revision:3});await newer;earlier.resolve({project:{id:'second'},revision:2});await assert.rejects(older,/revision changed/);assert.equal(received.length,1);assert.equal(current.revision,3);
 current={id:'second',generation:4,revision:3};await assert.rejects(runProjectCommand('second',2,{type:'rename',name:'Old screen'},dependencies),/open project changed/);assert.equal(calls.length,3,'Closing and reopening the same world must invalidate old callbacks');
});
