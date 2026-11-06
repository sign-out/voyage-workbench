import {test} from 'node:test';
import assert from 'node:assert/strict';
import {communityFixture} from '../../tests/community-reference-fixture';
import {buildCommunityReferences,communityGuideRequests,readReferenceHelp,referenceHelpTopics} from './community-reference';
import {referenceHelp,schemaGuidance,selectReferences} from './document';
import {mergeReferenceSets} from './references';
import {create,reduce,hash} from './project';
import {executeWorldTool,toolDefinitions,validateToolArguments} from './agent-tools';

test('community prose is cached separately from canonical codecs with exact starter bytes and provenance',()=>{
 const files=communityFixture(),bundle=buildCommunityReferences(files,1234),refs=bundle.sections;
 assert.equal(refs.find(entry=>entry.section==='npcs')!.schema._type,'record');
 assert.equal(refs.filter(entry=>entry.communityHelp).length,1);
 assert.equal(bundle.meta.sources.length,7);assert.equal(bundle.meta.sections,2);assert.equal(bundle.meta.guides,1);
 assert.ok(bundle.meta.sources.every((source:any)=>/^[a-f0-9]{64}$/.test(source.hash)));
 assert.equal(readReferenceHelp(refs,'seed').text,files['base-world.json']);
 assert.match(readReferenceHelp(refs,'limits').text!,/compactJson/);assert.match(readReferenceHelp(refs,'limits').text!,/no separate character cap/);
 assert.match(readReferenceHelp(refs,'voices').text!,/female calm controlled/);
 assert.match(readReferenceHelp(refs,'guide','world-building').text!,/<script>untrusted/);
 assert.equal(readReferenceHelp(refs).official,false);
 assert.equal(schemaGuidance('{"heroesVersion":37}',refs,'heroesVersion')[0].communityHelp,undefined);
 assert.deepEqual(referenceHelpTopics(refs)?.sections[1].path,['parties','','quests']);
 assert.equal(JSON.stringify(referenceHelpTopics(refs)).includes('Community character help.'),false);
});

test('help is version/scope matched, offline and paginated without changing authored bytes',()=>{
 const bundle=buildCommunityReferences(communityFixture(),1234),refs=bundle.sections,source='{"heroesVersion":37,"exact":9007199254740993}';
 const first=referenceHelp(source,refs,'section','npcs');assert.equal(first.text?.length,8000);assert.equal(first.nextOffset,8000);
 assert.equal(referenceHelp('{"data":{"world":{"initialGameState":'+source+'}}}',refs,'voices').available,true);
 const second=referenceHelp(source,refs,'section','npcs',first.nextOffset!);assert.equal(second.nextOffset,null);assert.equal((first.text!+second.text!).length,first.total);
 assert.equal(referenceHelp('{"heroesVersion":36}',refs).available,false);
 const scoped=refs.map(entry=>({...entry,environment:'alpha',compatibilityRevision:2}));
 assert.equal(referenceHelp('{"heroesVersion":37,"compatibilityRevision":1}',scoped).available,false);
 assert.equal(referenceHelp('{"heroesVersion":37,"compatibilityRevision":2}',scoped,'index','',0,{environment:'production'}).available,false);
 assert.equal(referenceHelp('{"heroesVersion":37,"compatibilityRevision":2}',scoped,'index','',0,{environment:'alpha'}).available,true);
 const catalog=mergeReferenceSets(buildCommunityReferences(communityFixture(36),1).sections,refs);
 assert.equal(selectReferences(source,catalog)[0].schemaVersion,37);
 assert.equal(referenceHelp(source,JSON.parse(JSON.stringify(catalog)),'voices').available,true);
 assert.equal(referenceHelp(source,refs,'section','missing').available,false);
 assert.throws(()=>readReferenceHelp(refs,'index','',-1));assert.throws(()=>readReferenceHelp(refs,'other' as any));
 assert.equal(source,'{"heroesVersion":37,"exact":9007199254740993}');
});

test('malformed, oversized or version-inconsistent bundles fail before install',()=>{
 const changes=[['voice-catalog.json',{schemaVersion:'V36'}],['base-world.json',{heroesVersion:36}],['wiki.json',[]],['wiki.json',[{section:'npcs',title:'NPCs',summary:'',body:'x'.repeat(256*1024+1)}]],['limits.json',{schemaVersion:'V37',count:1,limits:[{id:'one',label:'Broken numeric limit',enforced:2,sections:[]}]}],['guides/world-building.json',{section:'other',title:'Other',summary:'',body:''}]] as const;
 for(const [file,value] of changes){const files=communityFixture();files[file]=JSON.stringify(value);assert.throws(()=>buildCommunityReferences(files,1),/Community references:/);}
 const missing=communityFixture();delete missing['wiki.json'];assert.throws(()=>buildCommunityReferences(missing,1));
 const extra=communityFixture();extra['validate']='{}';assert.throws(()=>buildCommunityReferences(extra,1));
 for(const path of ['https://attacker.test/guides/world-building.json','//attacker.test/a','/guides/../schema.json','/guides/world-building.json?redirect=1'])assert.throws(()=>communityGuideRequests(JSON.stringify([{section:'world-building',title:'Guide',summary:'',json:path}])),/same-origin/);
 assert.throws(()=>communityGuideRequests(JSON.stringify([{section:'../schema',json:'/schema.json'}])),/topic ID/);
 assert.throws(()=>communityGuideRequests(JSON.stringify(Array(21).fill({}))),/guide index/);
});

test('normal agents can read bounded help but restricted roles gain no new tools or authority',()=>{
 const source='{"heroesVersion":37,"npcs":{}}';let project=create('p','World',source,1);
 project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',prompt:'Read help'});
 const task=project.tasks[0],refs=buildCommunityReferences(communityFixture(),1234).sections;
 const result=executeWorldTool(project,task,'world_reference_docs',{kind:'voices'},refs,'proposal',hash);
 assert.match(result.result.text,/male gruff/);assert.equal(result.command,undefined);assert.equal(project.activeSource,source);
 for(const work of [true,false])assert.ok(toolDefinitions(work).some(tool=>tool.name==='world_reference_docs'));
 for(const options of [{readOnly:true},{fieldFill:true},{grading:true}])assert.ok(!toolDefinitions(false,options).some(tool=>tool.name==='world_reference_docs'));
 assert.throws(()=>validateToolArguments('plan','world_reference_docs',{kind:'validate',world:source}));
 assert.throws(()=>validateToolArguments('plan','world_reference_docs',{kind:'section',offset:-1}));
});
