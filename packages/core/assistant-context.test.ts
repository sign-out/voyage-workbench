import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorSnapshot,assistantPacket} from './assistant-context';
import {create,reduce} from './project';
import {agentSystem} from './providers';

const source='{"world":{"title":"World","initialGameState":{"npcs":{"Mira":{"name":"Mira","exact":9007199254740993}},"regions":{"coast":{"name":"Coast"}},"combatSettings":{"damage":2}}}}';
test('vague NPC requests include the active collection even without lexical matches',()=>{
 const snapshot=editorSnapshot(source,{screen:'characters',label:'NPCs'})!;
 assert.deepEqual(snapshot.focusPaths,[['world','initialGameState','npcs']]);
 assert.match(snapshot.excerpts[0].source,/9007199254740993/);
 assert.equal(snapshot.selectionMissing,false);
});
test('explicit entity focus wins over a general screen and missing records are not invented',()=>{
 const snapshot=editorSnapshot(source,{screen:'characters',path:['world','initialGameState','npcs','Mira'],label:'Mira',hasUnappliedEdits:true})!;
 assert.equal(snapshot.excerpts.length,1);assert.equal(snapshot.label,'Mira');assert.equal(snapshot.hasUnappliedEdits,true);
 assert.equal(editorSnapshot(source,{screen:'map',section:'regions',key:'coast'})!.excerpts[0].path.at(-1),'coast');
 const missing=editorSnapshot(source,{screen:'characters',path:['missing']})!;
 assert.equal(missing.selectionMissing,true);assert.equal(missing.focusPaths[0].at(-1),'npcs');
});
test('context is bounded and only known fields are accepted; credential forms are never captured',()=>{
 const snapshot=editorSnapshot('{"npcs":{"huge":"'+ 'x'.repeat(20000)+'"}}',{screen:'characters',label:'x'.repeat(500),apiKey:'secret'} as any)!;
 assert.ok(JSON.stringify(snapshot).length<10000);assert.equal(snapshot.excerpts[0].truncated,true);assert.equal(snapshot.label.length,200);assert.doesNotMatch(JSON.stringify(snapshot),/secret/);
 assert.deepEqual(editorSnapshot(source,{screen:'providers'})!.excerpts,[]);
 assert.throws(()=>editorSnapshot(source,{screen:'characters',path:['x'.repeat(201)]}));
 assert.throws(()=>editorSnapshot(source,{screen:'characters',path:[-1]}));
});
test('task-start snapshots and contextual conversation survive later UI/data changes without granting edit rights',()=>{
 let project=create('p','World',source,1);
 const focus={screen:'characters',path:['world','initialGameState','npcs','Mira'],label:'Mira'};
 project=reduce(project,{type:'prepareTask',id:'t',attempt:'a',kind:'plan',prompt:'How can we improve this?',editorContext:focus});
 focus.path[3]='Other';focus.label='Other';
 const task=project.tasks[0],packet=assistantPacket(project,task);
 assert.equal(packet.editorContext!.label,'Mira');assert.equal(packet.editorContext!.focusPaths[0].at(-1),'Mira');
 assert.equal(project.chat[0].editorContext!.label,'Mira');assert.equal(project.activeSource,source);
 assert.match(agentSystem(false),/Editor focus is not permission/);assert.equal(packet.workOrder,undefined);
 assert.throws(()=>reduce(project,{type:'taskEdit',taskId:'t',attempt:'a',action:'replace',path:[],source:'{}'}));
});
test('publication focus handles envelopes and legacy tasks remain compatible',()=>{
 assert.equal(editorSnapshot(source,{screen:'publish'})!.focusPaths[0].join('/'),'world/title');
 let project=create('p','World',source,1);project=reduce(project,{type:'prepareTask',id:'t',attempt:'a',kind:'plan',prompt:'Discuss'});
 assert.equal(assistantPacket(project,project.tasks[0]).editorContext,undefined);
 project.chat=Array.from({length:20},(_,index)=>({role:'user',text:String(index)}));assert.equal(assistantPacket(project,project.tasks[0]).history.length,12);
});
test('systems collection focus distinguishes mechanics from narrator AI',()=>{
 const world='{"initialGameState":{"combatSettings":{"damage":2},"generateNPCDetails":"Narrator prompt","aiInstructions":"Instructions"}}';
 const mechanics=editorSnapshot(world,{screen:'systems',section:'mechanics'})!;
 assert.deepEqual(mechanics.focusPaths,[['initialGameState','combatSettings']]);
 const narrator=editorSnapshot(world,{screen:'systems',section:'ai'})!;
 assert.deepEqual(narrator.focusPaths,[['initialGameState','aiInstructions'],['initialGameState','generateNPCDetails']]);
 assert.equal(narrator.selectionMissing,false);
});
