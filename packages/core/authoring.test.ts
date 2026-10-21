import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as authoring from './authoring';
import * as doc from './document';
import {create,reduce,hash} from './project';
const source='{"shortId":"fixed","initialGameState":{"worldBackground":"","npcs":{"mara":{"id":"mara","name":"Mara","currentLocation":"home","faction":"guild","exact":9007199254740993,"unknown":1.2300e+42},"other":{"name":"Other","currentLocation":"missing","exact":2}},"locations":{"home":{"region":"north","imageUrl":"https://example.invalid/image.png"}},"regions":{"north":{"realm":"earth"}},"realms":{"earth":{}},"factions":{"guild":{}},"custom":{"system":"preserve"}}}';
const npc=['initialGameState','npcs','mara'];
test('entry catalogue is authored-only, searchable and paginated',()=>{
 const report=authoring.entryCatalog(source,'mara',0,2);assert.equal(report.entries.length,2);assert.ok(report.total>2);assert.ok(report.entries.every(entry=>entry.path[0]==='initialGameState'));assert.equal(authoring.entryCatalog(source,'shortId').total,0);assert.equal(authoring.entryCatalog(source,'custom').entries[0].section,'custom');
});
test('impact inspector uses known structural references and discloses limits',()=>{
 const incoming=authoring.referenceImpact(source,['initialGameState','locations','home'],'incoming');assert.equal(incoming.total,1);assert.equal(incoming.links[0].missing,false);assert.deepEqual(incoming.links[0].from,npc.concat('currentLocation'));
 const outgoing=authoring.referenceImpact(source,npc,'outgoing');assert.equal(outgoing.total,2);assert.match(outgoing.limitation,/Scripts/);assert.equal(authoring.referenceImpact(source,['initialGameState','npcs','other']).links[0].missing,true);assert.equal(authoring.referenceImpact(source,npc,'incoming').total,0);
});
test('completeness separates optional advice from validation errors and preserves custom systems',()=>{
 const report=authoring.completeness(source,[{section:'npcs',schema:{_type:'record',codomain:{_type:'required',fields:{name:'string'}}}}],['worldBackground','custom','optional']);assert.equal(report.issues.filter(issue=>issue.level==='error').length,0);assert.equal(report.advice.length,2);assert.equal(authoring.completeness(source,[],[]).advice.length,0);
});
test('readiness never confuses local checks, saved baselines and official approval',()=>{
 const project=create('p','World',source,1),rows=()=>authoring.readiness(project,[],hash(source));assert.equal(rows().find(row=>row.id==='remote')?.state,'unknown');assert.equal(rows().find(row=>row.id==='official')?.state,'unknown');project.remote.worldId='fixed';project.remote.baselineHash='old';assert.equal(rows().find(row=>row.id==='remote')?.state,'stale');project.remote.baselineHash=hash(source);assert.equal(rows().find(row=>row.id==='remote')?.state,'pass');assert.equal(authoring.readiness(project,[],hash(source),{hash:'old',valid:true,stage:'publish',created:1}).find(row=>row.id==='official')?.state,'stale');assert.equal(authoring.readiness(project,[],hash(source),{hash:hash(source),valid:true,stage:'draft',created:1}).find(row=>row.id==='moderation')?.state,'unknown');
 project.remote.operations=[{state:'UNKNOWN'}];assert.equal(rows().find(row=>row.id==='journal')?.state,'blocked');project.draft={path:npc,text:'{}',baseHash:hash(source)};assert.equal(rows().find(row=>row.id==='draft')?.state,'blocked');
});
test('asset inventory deduplicates usage and measures only known embedded bytes',()=>{
 const report=authoring.assetInventory('{"imageUrl":"https://invalid/img","imagePrompt":"not an asset","portrait":"https://invalid/img","sounds":["ignore"],"audio":["data:audio/mp3;base64,YQ=="]}');assert.equal(report.total,2);assert.equal(report.assets[0].paths.length,2);assert.equal(report.assets[0].bytes,null);assert.equal(report.assets[1].bytes,1);assert.equal(authoring.assetInventory(source,'audio').total,0);
});
test('safe duplication retains exact numbers, unknown fields and external relationships',()=>{
 const duplicate=authoring.duplicateEntry(source,npc,'mara2','Mara II');assert.equal(doc.read(duplicate,npc),doc.read(source,npc));const raw=doc.read(duplicate,['initialGameState','npcs','mara2']);assert.match(raw,/9007199254740993/);assert.match(raw,/1.2300e\+42/);assert.equal(doc.read(duplicate,['shortId']),'"fixed"');assert.match(raw,/"id":"mara2"/);assert.match(raw,/"currentLocation":"home"/);assert.equal(doc.diff(source,duplicate).total,1);
});
test('duplication rejects collisions, package records, arrays and ambiguous identity',()=>{
 for(const [path,key] of [[npc,'mara'],[npc,'__proto__'],[['shortId'],'copy'],[['initialGameState','npcs'],'copy']] as [doc.Path,string][])assert.throws(()=>authoring.duplicateEntry(source,path,key));
 assert.throws(()=>authoring.duplicateEntry('{"npcs":{"m":{"id":"independent"}}}',['npcs','m'],'copy'),/independent/);assert.throws(()=>authoring.duplicateEntry('{"npcs":{"m":{"shortId":"package"}}}',['npcs','m'],'copy'),/package identity/);
});
test('batch edits are narrow, type checked and preserve untouched lexical JSON',()=>{
 const changed=authoring.batchEdit(source,[npc,['initialGameState','npcs','other']],'name','"Updated"');assert.match(changed,/9007199254740993/);assert.match(changed,/1.2300e\+42/);assert.equal(doc.diff(source,changed).total,2);assert.equal(doc.read(changed,npc.concat('currentLocation')),'"home"');
 for(const [field,value] of [['name','42'],['id','"new"'],['currentLocation','"home"'],['exact','{}'],['unknown','1']])assert.throws(()=>authoring.batchEdit(source,[npc,['initialGameState','npcs','other']],field,value));assert.throws(()=>authoring.batchEdit(source,[npc,npc],'name','"x"'));assert.throws(()=>authoring.batchEdit(source,[],'name','"x"'));
});
test('authoring mutations stage proposals and reject drafts and stale baselines',()=>{
 const project=create('p','World',source,1),command={type:'authoringProposal',operation:'duplicate',id:'copy',baseHash:hash(source),path:npc,newKey:'copy'};
 const staged=reduce(project,command);assert.equal(staged.activeSource,source);assert.equal(staged.candidates[0].kind,'authoring');assert.match(reduce(staged,{type:'accept',id:'copy'}).activeSource,/"copy"/);assert.throws(()=>reduce(project,{...command,baseHash:'old'}));assert.throws(()=>reduce(reduce(project,{type:'draft',path:npc,text:'{}',baseHash:hash(source)}),command),/draft/);assert.throws(()=>reduce(staged,command),/unique/);
});
test('bookmarks persist separately from world content and preserve missing destinations',()=>{
 const project=reduce(create('p','World',source,1),{type:'bookmark',id:'b',name:'Mara',path:npc,baseHash:hash(source)});assert.equal(project.activeSource,source);const removed=reduce(project,{type:'remove',path:npc,baseHash:hash(source)});assert.equal(removed.bookmarks?.length,1);assert.deepEqual(removed.bookmarks?.[0].path,npc);assert.equal(reduce(removed,{type:'removeBookmark',id:'b'}).bookmarks?.length,0);assert.throws(()=>reduce(project,{type:'bookmark',id:'x',name:'Identity',path:['shortId'],baseHash:hash(source)}));
});
test('reviewed Work Orders require explicit authored scope and revalidate at task start',()=>{
 const project=create('p','World',source,1),order={objective:'Improve',requirements:[],allowedPaths:[],reviewedScope:true};assert.throws(()=>reduce(project,{type:'workOrder',baseHash:hash(source),order}),/Select/);assert.throws(()=>reduce(project,{type:'workOrder',baseHash:'old',order:{...order,allowedPaths:[npc]}}));
 const approved=reduce(project,{type:'workOrder',baseHash:hash(source),order:{...order,allowedPaths:[npc]}}),deleted=reduce(approved,{type:'remove',path:npc,baseHash:hash(source)});assert.throws(()=>reduce(deleted,{type:'prepareTask',id:'t',attempt:'a',kind:'work'}));assert.deepEqual(reduce(project,{type:'workOrder',baseHash:hash(source),order:{...order,wholeWorld:true}}).workOrder.allowedPaths,[['initialGameState']]);
});
test('notes default on, task overrides and explicit note queues remain intact',()=>{
 const project=reduce(create('p','World',source,1),{type:'builderNote',baseHash:hash(source),note:{id:'n',path:npc,text:'Improve',planning:true}}),task=(input:any)=>reduce(project,{type:'prepareTask',id:'t',attempt:'a',kind:'plan',...input}).tasks[0];assert.equal(task({}).builderNotes?.length,1);assert.equal(task({includeBuilderNotes:false}).builderNotes?.length,0);assert.equal(task({includeBuilderNotes:false,addressNotes:true}).builderNotes?.length,1);assert.throws(()=>task({includeBuilderNotes:'false'}));
});
test('preferences normalize malformed input without making safeguards optional',()=>{
 const preferences=authoring.authoringPreferences({recentLimit:999,includeNotes:false,assetKind:'unsafe',advisorySections:['npcs','npcs',42],reviewGrouping:'anything'});assert.equal(preferences.recentLimit,50);assert.equal(preferences.includeNotes,false);assert.equal(preferences.assetKind,'all');assert.deepEqual(preferences.advisorySections,['npcs']);assert.equal(preferences.reviewGrouping,'entity');
});
test('work cannot start from a suggestion that became stale after order approval',()=>{
 let project=create('p','World',source,1);project=reduce(reduce(project,{type:'prepareTask',id:'plan',attempt:'a',kind:'plan'}),{type:'taskRunning',taskId:'plan',attempt:'a'});project=reduce(project,{type:'proposeWorkOrder',taskId:'plan',attempt:'a',id:'suggestion',order:{objective:'Improve',requirements:[],allowedPaths:[npc]}});project=reduce(project,{type:'taskDone',taskId:'plan',attempt:'a'});project=reduce(project,{type:'workOrder',baseHash:hash(source),order:{reviewedScope:true,objective:'Improve',requirements:[],allowedPaths:[npc],sourceProposalId:'suggestion'}});project=reduce(project,{type:'edit',baseHash:hash(source),path:npc.concat('name'),source:'"Changed"'});assert.throws(()=>reduce(project,{type:'prepareTask',id:'work',attempt:'a',kind:'work'}),/stale or missing/);
});
test('entity review groups exact changes without replacing the underlying choices',()=>{
 const next=authoring.batchEdit(source,[npc,['initialGameState','npcs','other']],'name','"Next"'),changes=doc.diff(source,next).changes,groups=authoring.groupedChanges(source,changes);assert.equal(groups.length,2);assert.deepEqual(groups.flatMap(group=>group.changes),changes);assert.equal(authoring.groupedChanges(source,changes,'field').length,2);
});
