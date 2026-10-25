import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantRecoveryBudget,assistantRecoverySettings} from './assistant-recovery';
import {assistantCompletionValidation,create,reduce,nativeRequest} from './project';
import {assistantPacket} from './assistant-context';

test('recovery settings strictly normalize defaults and bounded integers',()=>{
 assert.deepEqual(assistantRecoverySettings(),{enabled:true,maxAttempts:3});
 assert.deepEqual(assistantRecoverySettings({enabled:false}),{enabled:false,maxAttempts:3});
 for(const input of [null,[],true,'3',{enabled:'false'},{maxAttempts:'3'},{maxAttempts:0},{maxAttempts:11},{maxAttempts:1.5},{maxAttempts:NaN},{maxAttempts:Infinity},{extra:true}])assert.throws(()=>assistantRecoverySettings(input));
 for(const maxAttempts of [1,10])assert.equal(assistantRecoverySettings({maxAttempts}).maxAttempts,maxAttempts);
 assert.deepEqual(JSON.parse(nativeRequest(JSON.stringify({operation:'assistantRecoverySettings',args:[]}))),{enabled:true,maxAttempts:3});
});

test('one task budget allows N corrective opportunities, with no reset after success',()=>{
 const budget=new AssistantRecoveryBudget({enabled:true,maxAttempts:3});
 let failures=0;
 const fail=()=>{failures++;throw new Error('Invalid JSON source');};
 for(let attempt=1;attempt<=3;attempt++){
  assert.equal((budget.tool(fail,()=>{}) as any).recovery.attempt,attempt);
  assert.equal(budget.tool(()=>42,()=>{}),42);
 }
 assert.throws(()=>budget.tool(fail,()=>{}),/exhausted after 3 corrective opportunities/);
 assert.equal(failures,4);
 assert.equal(budget.attempts,3);
});

test('disabled recovery and fatal scope, auth and cancellation errors never grant opportunities',()=>{
 const disabled=new AssistantRecoveryBudget({enabled:false,maxAttempts:3});
 assert.throws(()=>disabled.correctiveOpportunity(new Error('Invalid JSON')),/disabled/);
 assert.equal(disabled.attempts,0);
 const budget=new AssistantRecoveryBudget();
 for(const message of ['Task canceled','Task stopped','Task attempt no longer exists','This path is outside the approved Work Order scope.','The frozen Work Order source changed.','HTTP 401','Authentication failed','Network failed'])assert.throws(()=>budget.correctiveOpportunity(new Error(message)),new RegExp(message.replaceAll('.','\\.')));
 let executed=false;
 assert.throws(()=>budget.tool(()=>{executed=true;},()=>{throw new Error('Task canceled');}),/canceled/);
 assert.equal(executed,false);
 assert.equal(budget.attempts,0);
});

test('task snapshots and completion preflight are available through the native document bridge',()=>{
 const settings={enabled:false,maxAttempts:2};
 const project=reduce(create('p','World','{"description":""}',1),{type:'prepareTask',id:'t',attempt:'a',kind:'plan',assistantRecovery:settings,fieldFill:{source:'{"description":""}',path:[],instructions:'Fill description'}});
 settings.enabled=true;
 const task=project.tasks[0],before=JSON.stringify(project);
 assert.deepEqual(task.assistantRecovery,{enabled:false,maxAttempts:2});
 assert.deepEqual(assistantPacket(project,task).assistantRecovery,task.assistantRecovery);
 assert.throws(()=>assistantCompletionValidation(project,task,'not JSON'));
 assert.deepEqual(assistantCompletionValidation(project,task,'[]'),{valid:true});
 assert.deepEqual(JSON.parse(nativeRequest(JSON.stringify({operation:'assistantCompletionValidation',args:[project,task,'[]']}))),{valid:true});
 assert.equal(JSON.stringify(project),before);
 assert.deepEqual(reduce(create('p','World','{}',1),{type:'prepareTask',id:'t',attempt:'a',kind:'plan'}).tasks[0].assistantRecovery,{enabled:true,maxAttempts:3});
});
