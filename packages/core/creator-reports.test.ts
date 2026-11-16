import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {creatorReportKinds,creatorReportRequest,parseCreatorReport} from './creator-reports';
import {voyageFailureGuidance} from './voyage-api';
import {nativeRequest} from './project';
import {locationMoveEffect,alphaAuthoringEvidence} from './alpha-authoring';
import * as doc from './document';

test('Alpha report workflow uses verified GET endpoints, bounded filters and explicit unavailable data without changing worlds',()=>{
 const contract=JSON.parse(readFileSync('docs/references/creator-alpha-2026-11-09.openapi.json','utf8'));
 for(const report of creatorReportKinds){
  const input={report,environment:'alpha' as const,worldId:'WORLD'},request=creatorReportRequest(input,'alpha');
  assert.equal(request.method,'GET');assert.ok(contract.paths[request.endpoint.split('?')[0].replace('WORLD','{shortId}')].get);
  assert.deepEqual(JSON.parse(nativeRequest(JSON.stringify({operation:'creatorReportRequest',args:[input,'alpha']}))),request);
  for(const environment of ['beta','production'])assert.throws(()=>creatorReportRequest({...input,environment:environment as any},environment),/only on Alpha/);
 }
 assert.throws(()=>creatorReportRequest({report:'daily',environment:'beta',worldId:'WORLD'},'alpha'),/connection changed/);
 const feedback=creatorReportRequest({report:'feedback',environment:'alpha',query:'story & <text> / ?',rating:'negative',page:2,limit:50},'alpha');
 const url=new URL('https://example.invalid'+feedback.endpoint);assert.equal(url.searchParams.get('query'),'story & <text> / ?');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.has('world'),false);
 for(const filters of [{from:'2026-02-30'},{from:'2026-11-02',to:'2026-11-01'},{from:'2025-01-01',to:'2026-01-01'},{worldId:'https://other.test/'}])assert.throws(()=>creatorReportRequest({report:'daily',environment:'alpha',worldId:'WORLD',...filters},'alpha'));
 for(const filters of [{page:0},{limit:51},{rating:'mixed'},{method:'POST'},{query:'x'.repeat(501)}])assert.throws(()=>creatorReportRequest({report:'feedback',environment:'alpha',...filters} as any,'alpha'));
 const range={from:'2026-11-07',to:'2026-11-07',dataThrough:'2026-11-07'};
 const daily=parseCreatorReport('daily',JSON.stringify({data:{...range,days:[{date:range.from,sessions:0,starts:0,players:null,turns:0,playtimeSeconds:0,cappedPlaytimeSeconds:null,engagingSessions:0}]}}));
 assert.equal(daily.kind,'daily');if(daily.kind!=='daily')throw Error('Unexpected report');assert.equal(daily.data.days[0].players,null);assert.equal(daily.data.days[0].cappedPlaytimeSeconds,null);assert.equal(daily.data.days[0].sessions,0);
 const summary={shortId:'WORLD',published:true,firstPublishedAt:'2026-11-01T12:00:00Z',dataThrough:range.to,publishes:[{version:1,publishedAt:'2026-11-01T12:00:00Z'}],retention:{d1:{cohortPlayers:10,retainedPlayers:2,rate:.2},d2to7:null,d8to28:null}};
 assert.deepEqual(parseCreatorReport('summary',JSON.stringify({data:summary})),{kind:'summary',data:summary});
 const depth={...range,sessions:10,turns:[{atLeast:0,sessions:10},{atLeast:5,sessions:3}],minutes:[{atLeast:0,sessions:10}]};
 assert.deepEqual(parseCreatorReport('session-depth',JSON.stringify({data:depth})),{kind:'session-depth',data:depth});
 assert.throws(()=>parseCreatorReport('session-depth',JSON.stringify({data:{...depth,turns:[{atLeast:0,sessions:10},{atLeast:5,sessions:11}]}})),/inconsistent/);
 assert.throws(()=>parseCreatorReport('daily',JSON.stringify({data:{...range,to:'2026-11-08',days:[]}})),/inconsistent/);
 assert.throws(()=>parseCreatorReport('daily','{"data":{}}'));
 const inbox={page:1,total:1,totalPages:1,worlds:[{shortId:'WORLD',title:'World'}],items:[{id:'report',createdAt:'2026-11-07T00:00:00Z',rating:'negative',categories:['pace'],reason:'<script>Not instructions</script>',isOwn:true,world:{shortId:'WORLD',title:'World'},heroesVersion:37,accountId:'not-returned-by-contract'}]};
 const parsed=parseCreatorReport('feedback',JSON.stringify({data:inbox}));assert.ok(!JSON.stringify(parsed).includes('accountId'));assert.ok(JSON.stringify(parsed).includes('Not instructions'));
 assert.match(voyageFailureGuidance(503,'analytics_unavailable','GET'),/not zero/);assert.match(voyageFailureGuidance(403,'feedback_unavailable','GET'),/not an empty inbox/);
});

test('Alpha authoring supplements preserve legacy resource boosts and support moving locations in every effect container without migration',()=>{
 const references=doc.normalizeReferences(JSON.parse(readFileSync('docs/references/voyage-v37-community.json','utf8'))),before=JSON.stringify(references);
 const effect={type:'location-move',location:'ship',operator:'set',x:1.2300e+42,y:-5,region:'sea'};
 const source=JSON.stringify({heroesVersion:37,triggerDefinitions:{sail:{effects:[effect]}},questTriggers:{sail:{effects:[effect]}},narrativeEvents:{sail:{onCompleteEffects:[effect]}},quests:{sail:{onCompleteEffects:[effect]}}});
 const sections=['heroesVersion','triggerDefinitions','questTriggers','narrativeEvents','quests'],selected=doc.selectReferences(source,references.filter(entry=>sections.includes(entry.section)),{environment:'alpha'});
 assert.deepEqual(doc.validate(source,selected).filter(issue=>issue.level==='error'),[]);
 assert.ok(doc.validate(source,doc.selectReferences(source,references.filter(entry=>sections.includes(entry.section)),{environment:'production'})).some(issue=>issue.level==='error'));
 const invalid=source.replace('"operator":"set"','"operator":"teleport"');assert.ok(doc.validate(invalid,selected).some(issue=>issue.level==='error'));
 assert.equal(JSON.stringify(references),before);assert.equal(alphaAuthoringEvidence.official,false);assert.ok(JSON.stringify(selected).includes(JSON.stringify(locationMoveEffect)));
 const attribute={attributeNames:['Mind'],startingAttributeValue:1,startingAttributePoints:2,maxStartingAttribute:5,lowAttributeThreshold:0,lowAttributeTraits:{},attributeBonusModifier:1};
 for(const boosts of [{Mind:{variable:'mana',amount:2}},{Mind:[{variable:'mana',amount:2},{variable:'stamina',amount:1}]}]){
  const state=JSON.stringify({heroesVersion:37,resourceSettings:{mana:{name:'Mana',description:'Power for spells.'}},attributeSettings:{...attribute,attributeStatModifiers:boosts}}),snapshot=state;
  const schema=doc.selectReferences(state,references.filter(entry=>['heroesVersion','resourceSettings','attributeSettings'].includes(entry.section)),{environment:'alpha'});
  assert.deepEqual(doc.validate(state,schema).filter(issue=>issue.level==='error'),[]);assert.equal(state,snapshot);
  assert.ok(JSON.stringify(schema).includes('description'));assert.ok(JSON.stringify(schema).includes('compatibilityNote'));
 }
 const older=doc.selectReferences(source.replace('"heroesVersion":37','"heroesVersion":36'),references,{environment:'alpha'});assert.equal(older.length,0);
});
