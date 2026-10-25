import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentProjectReceipt} from './project-receipts';
test('late receipts cannot roll back project snapshots or cross workspace generations',()=>{
 const requested={id:'world',generation:4},current={id:'world',generation:4,revision:10};
 for(const revision of [10,11])assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision},requested,current),true);
 for(const revision of [9,undefined,NaN,1.5])assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision},requested,current),false);
 assert.equal(isCurrentProjectReceipt({project:{id:'other'},revision:11},requested,current),false);
 assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision:11},requested,{...current,id:'other'}),false);
 assert.equal(isCurrentProjectReceipt({project:{id:'world'},revision:11},requested,{...current,generation:6}),false);
 assert.equal(isCurrentProjectReceipt({revision:11},requested,current),false);
});
