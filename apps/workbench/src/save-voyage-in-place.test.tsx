import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../../../packages/core/project';
import {saveVoyageInPlace} from './save-voyage-in-place';

test('saving from the current screen handles setup, approval, concurrency, edits, stale links and failures without another save',async()=>{
 const project=create('world','World','{"title":"World","initialGameState":{"exact":9007199254740993}}',1);
 let writes=0,confirmations=0,finish!:()=>void;
 const options={project,current:()=>project,hasEdits:false,running:false,connection:{environment:'alpha',voyage:true},confirm:(message:string)=>{confirmations++;assert.match(message,/alpha Voyage draft WORLD/);return true;},save:async()=>{writes++;}};
 assert.equal(await saveVoyageInPlace(options),'link');assert.equal(writes,0);assert.equal(confirmations,0);
 project.remote.worldId='WORLD';project.remote.environment='alpha';project.remote.etag='"revision"';
 assert.equal(await saveVoyageInPlace({...options,connection:{environment:'production',voyage:false}}),'connection');assert.equal(confirmations,0);
 let engineChecks=0;assert.equal(await saveVoyageInPlace({...options,connection:{environment:'production',voyage:true},inspectEngine:async()=>{engineChecks++;return {warning:'World engine upgrade: V37 / revision 9 → V37 / revision 10.'};},confirm:message=>{assert.match(message,/selected production Voyage draft WORLD/);assert.match(message,/World engine upgrade/);return false;}}),'cancelled');assert.equal(engineChecks,1);assert.equal(writes,0);
 assert.equal(await saveVoyageInPlace({...options,connection:{environment:'beta',voyage:true},confirm:message=>{assert.match(message,/selected beta Voyage draft WORLD/);return true;}}),'saved');assert.equal(writes,1);writes=0;
 assert.equal(await saveVoyageInPlace({...options,confirm:()=>false}),'cancelled');assert.equal(writes,0);
 await assert.rejects(saveVoyageInPlace({...options,inspectEngine:async()=>({environment:'beta',warning:''})}),/connection changed/);assert.equal(writes,0);
 for(const changed of [{hasEdits:true},{running:true}])await assert.rejects(saveVoyageInPlace({...options,...changed}));
 const changed={...project,remote:{...project.remote,worldId:'OTHER'}};await assert.rejects(saveVoyageInPlace({...options,current:()=>changed}),/world or Voyage link changed/);assert.equal(writes,0);
 const pending=saveVoyageInPlace({...options,save:async()=>{writes++;await new Promise<void>(resolve=>finish=resolve);}});
 assert.equal(writes,1);assert.equal(await saveVoyageInPlace(options),'cancelled');assert.equal(writes,1);finish();assert.equal(await pending,'saved');
 await assert.rejects(saveVoyageInPlace({...options,save:async()=>{writes++;throw new Error('Official validation rejected the world');}}),/Official validation/);assert.equal(writes,2);
 assert.match(project.activeSource,/9007199254740993/);assert.equal(project.remote.worldId,'WORLD');
});
