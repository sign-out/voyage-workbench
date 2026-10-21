import test from 'node:test';
import assert from 'node:assert/strict';
import * as document from './document';
import {create,reduce,hash} from './project';

const envelope='{"shortId":"WORLD","title":"Public copy","loadStatus":"loaded","initialGameState":{"number":9007199254740993,"custom":{"shortId":"authored"}}}';
test('explorer roots at content for each supported envelope and keeps exact metadata separate',()=>{
 for(const [source,root] of [[envelope,['initialGameState']],['{"world":'+envelope+'}',['world','initialGameState']],['{"data":{"world":'+envelope+'}}',['data','world','initialGameState']]] as [string,document.Path][]){const node=document.explorerDescribe(source);assert.deepEqual(node.path,root);assert.deepEqual(node.rootPath,root);assert.ok(node.packageFields.some(field=>field.key==='shortId'&&field.source==='"WORLD"'));assert.ok(!node.children.some(child=>child.key==='shortId'));assert.equal(document.explorerSearch(source,'WORLD').length,0);assert.ok(document.explorerSearch(source,'authored').every(result=>JSON.stringify(result.path).startsWith(JSON.stringify(root).slice(0,-1))));assert.equal(document.read(source,root.concat('number')),'9007199254740993');assert.equal(document.explorerDescribe(source,root.slice(0,-1).concat('shortId')).readOnly,true);}
 const bare='{"shortId":"authored"}';assert.deepEqual(document.explorerDescribe(bare).rootPath,[]);assert.equal(document.explorerDescribe(bare,['shortId']).readOnly,false);
});
test('identity is guarded across edits, insert/remove, root drafts and proposals',()=>{
 const project=create('p','World',envelope,1),baseHash=hash(envelope);
 for(const command of [{type:'edit',path:['shortId'],source:'"BAD"',baseHash},{type:'edit',path:[],source:'{}',baseHash},{type:'remove',path:['shortId'],baseHash},{type:'insert',path:[],key:'canSafelySave',source:'true',baseHash}])assert.throws(()=>reduce(project,command),/metadata .*read only/);
 const draft=reduce(project,{type:'draft',path:[],text:envelope.replace('WORLD','BAD'),baseHash});assert.throws(()=>reduce(draft,{type:'applyDraft'}),/read only/);assert.equal(draft.draft?.text,envelope.replace('WORLD','BAD'));
 const proposal=reduce(project,{type:'stage',id:'bad',kind:'work',source:envelope.replace('WORLD','BAD')});assert.throws(()=>reduce(proposal,{type:'accept',id:'bad'}),/read only/);
 const imported=reduce(project,{type:'stage',id:'import',kind:'import',source:envelope.replace('WORLD','IMPORTED')});assert.ok(reduce(imported,{type:'accept',id:'import'}).activeSource.includes('IMPORTED'));
 assert.equal(project.activeSource,envelope);
});
test('publication copy and legitimately named content fields remain editable',()=>{
 let project=create('p','World',envelope,1);project=reduce(project,{type:'edit',path:['title'],source:'"New public copy"',baseHash:hash(project.activeSource)});project=reduce(project,{type:'edit',path:['initialGameState','custom','shortId'],source:'"new authored value"',baseHash:hash(project.activeSource)});
 assert.equal(document.read(project.activeSource,['shortId']),'"WORLD"');assert.equal(document.read(project.activeSource,['initialGameState','number']),'9007199254740993');
});
test('agent work cannot alter package credentials or identity even with whole-world scope',()=>{
 let project=create('p','World',envelope,1);project=reduce(project,{type:'workOrder',baseHash:hash(envelope),order:{reviewedScope:true,objective:'Edit content',requirements:[],allowedPaths:[],wholeWorld:true}});project=reduce(project,{type:'prepareTask',kind:'work',id:'agent',attempt:'attempt'});project=reduce(project,{type:'taskRunning',taskId:'agent',attempt:'attempt'});
 for(const action of [{path:['shortId'],source:'"BAD"'},{action:'remove',path:['loadStatus']},{action:'insert',path:[],key:'canSafelySave',source:'true'}])assert.throws(()=>reduce(project,{type:'taskEdit',taskId:'agent',attempt:'attempt',...action}),/scope|read only/);
 assert.equal(project.tasks[0].stagedSource,envelope);assert.equal(project.activeSource,envelope);
});
