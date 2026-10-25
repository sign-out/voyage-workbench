import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from './store';
test('saved plans survive store restart and stay separate from exported world source',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-chat-plan-'));let store=new Store(directory);
 try{
  const created=store.create('World','{"title":"Before"}').project!;
  store.dispatch(created.id,{type:'chatPlan',expectedRevision:0,plan:{title:'Approved direction',text:'Add a rival.'}});
  store.close();store=new Store(directory);
  const restored=store.project(created.id);assert.equal(restored.chatPlan?.text,'Add a rival.');assert.equal(restored.activeSource,created.activeSource);assert.deepEqual(restored.tasks,[]);assert.deepEqual(store.history(created.id),[]);
  assert.throws(()=>store.dispatch(created.id,{type:'chatPlan',expectedRevision:0,plan:{title:'Stale',text:'Stale'}}),/changed/);assert.equal(store.project(created.id).chatPlan?.revision,1);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
