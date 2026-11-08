import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {voyageProfile,inspectVoyageContract,coverRecommendation,releaseAdvisories,workspacePersistence,compatibilityIdentity,worldEngineStatus} from './voyage-compatibility';
import {create,reduce,hash,nativeRequest} from './project';
import {executeWorldTool,completionEvidence} from './agent-tools';
import * as doc from './document';
import {artworkDestinations,assignArtwork,artworkPrompt} from './artwork';
import {coverGenerationPrompt} from './covers';
import {createWorkspace,creationArtifactSpecs,creationBriefHash} from './world-creation';
import {prepareCreationTransfer} from './creation-transfer';

const contract=readFileSync('docs/openapi.json','utf8'),guide=readFileSync('docs/voyage-agent-guide.md','utf8');
test('engine warnings use world versions, distinguish persisted and converted drafts, and never guess from a host label',()=>{
 const source='{"shortId":"WORLD","initialGameState":{"heroesVersion":37,"compatibilityRevision":9,"exact":9007199254740993}}';
 const response=(state=source,metadata={})=>'{"data":{"world":'+state+','+JSON.stringify(metadata).slice(1)+'}';
 const older={heroesVersion:37,compatibilityRevision:9},newer={heroesVersion:37,compatibilityRevision:10},upgraded=source.replace('"compatibilityRevision":9','"compatibilityRevision":10');
 for(const environment of ['alpha','beta','production']){
  const same=worldEngineStatus('{"data":{"world":'+source+'}}',source,environment,'WORLD',1);
  assert.equal(same.warning,'');assert.equal(same.savedVersion,undefined);assert.equal(same.environment,environment);
  const warning=worldEngineStatus(response(upgraded,{savedVersion:older,pendingVersionUpgrade:{sourceVersion:older,targetVersion:newer}}),source,environment,'WORLD',2);
  assert.match(warning.warning,/V37 \/ revision 9 → V37 \/ revision 10/);assert.match(warning.warning,/requires your approval/);assert.match(warning.warning,/No upgrade has been approved/);assert.deepEqual(warning.savedVersion,older);assert.deepEqual(warning.draftVersion,newer);
 }
 assert.match(worldEngineStatus('{"data":{"world":'+upgraded+'}}',source,'beta','WORLD').warning,/did not report the persisted/);
 assert.match(worldEngineStatus(response(upgraded,{savedVersion:newer}),source,'alpha','WORLD').warning,/World engine upgrade/);
 assert.equal(worldEngineStatus(response(upgraded,{savedVersion:newer}),upgraded,'production','WORLD').warning,'');
 assert.throws(()=>worldEngineStatus(response(source,{pendingVersionUpgrade:{targetVersion:newer}}),source,'alpha','WORLD'),/incomplete/);
 assert.throws(()=>worldEngineStatus(response(source,{savedVersion:{heroesVersion:37,compatibilityRevision:-1}}),source,'alpha','WORLD'),/invalid/);
 assert.match(source,/9007199254740993/);assert.match(source,/"compatibilityRevision":9/);
});
test('configured official contract baselines retain their pinned source fingerprints',()=>{
 const profiles=JSON.parse(readFileSync('packages/core/voyage-compatibility.json','utf8'));
 assert.equal(profiles.format,1);
 for(const profile of Object.values(profiles.environments) as any[]){
  const raw=readFileSync(profile.contractBaseline,'utf8');
  assert.equal(createHash('sha256').update(raw.replace(/\n$/,'')).digest('hex'),profile.contractHash);
 }
 for(const name of ['creator-alpha-2026-11-05','creator-beta-2026-11-07']){
  const raw=readFileSync('docs/references/'+name+'.openapi.json','utf8'),metadata=JSON.parse(readFileSync('docs/references/'+name+'.meta.json','utf8'));
  assert.equal(createHash('sha256').update(raw).digest('hex'),metadata.bundledSha256);
  if(metadata.guideBaseline)assert.equal(createHash('sha256').update(readFileSync(metadata.guideBaseline)).digest('hex'),metadata.guideSha256);
 }
});
test('profiles separate API hosts, cover recommendations and release evidence',()=>{
 assert.equal(voyageProfile('production').apiBase,'https://api.aidungeon.com/creator/v1');
 assert.throws(()=>voyageProfile('https://other.test'));
 assert.equal(voyageProfile('beta').apiBase,'https://api-beta.aidungeon.com/creator/v1');
 assert.equal(voyageProfile('beta').studioUrl,'https://beta.voyage.io/studio');
 assert.equal(voyageProfile('beta').release,null);
 assert.deepEqual(coverRecommendation('beta'),{width:1280,height:720});
 const beta=inspectVoyageContract('beta',readFileSync(voyageProfile('beta').contractBaseline,'utf8'),guide,1);
 assert.equal(beta.environment,'beta');assert.equal(beta.version,'1.3.0-preview');assert.equal(beta.operations.length,27);
 assert.ok(!beta.operations.some(operation=>operation.includes('version-upgrade')));
 assert.deepEqual(coverRecommendation('beta',beta),{width:1280,height:720});
 assert.deepEqual(coverRecommendation('alpha'),{width:1280,height:720});
 assert.deepEqual(coverRecommendation('production'),{width:1000,height:1000});
 const snapshot=inspectVoyageContract('production',contract,guide,1);
 assert.equal(snapshot.operations.length,27);assert.equal(snapshot.checked,1);
 assert.deepEqual(coverRecommendation('alpha',snapshot),{width:1280,height:720});
 const modified=JSON.parse(contract);modified['x-media-constraints'].targets.WORLD_COVER.recommendedWidth=1600;
 assert.deepEqual(coverRecommendation('alpha',inspectVoyageContract('alpha',JSON.stringify(modified),guide)),{width:1600,height:1000});
 for(const invalid of [{}, {...JSON.parse(contract),servers:[{url:'https://other.test'}]}])assert.throws(()=>inspectVoyageContract('alpha',JSON.stringify(invalid),guide));
 assert.throws(()=>inspectVoyageContract('alpha',contract,'Not a guide'));
 assert.match(coverGenerationPrompt({title:'Port',premise:'Travel',direction:'Sea',original:true},'alpha'),/1280 × 720 widescreen/);
 assert.match(coverGenerationPrompt({title:'Port',premise:'Travel',direction:'Sea',original:true},'production'),/1000 × 1000 square/);
});
test('source-to-world artwork pins its target without changing legacy plans or API links',()=>{
 const input={id:'creation',brief:'Make a coastal world',documents:[{id:'source',name:'source.md',text:'A coastal port.'}]};
 const legacy=createWorkspace(input,hash),alpha=createWorkspace({...input,targetEnvironment:'alpha'},hash),production=createWorkspace({...input,targetEnvironment:'production'},hash);
 for(const workspace of [legacy,alpha,production])workspace.artwork=[{id:'cover',destinationId:'creation-cover',prompt:'A dramatic coastal arrival.'}];
 assert.match(creationArtifactSpecs(legacy,'{}',hash)[0].prompt,/1000 × 1000/);
 assert.match(creationArtifactSpecs(alpha,'{}',hash)[0].prompt,/1280 × 720/);
 assert.match(creationArtifactSpecs(production,'{}',hash)[0].prompt,/1000 × 1000/);
 assert.notEqual(creationBriefHash(alpha,hash),creationBriefHash(production,hash));
 assert.equal(prepareCreationTransfer(alpha,'{}',hash,'restored').targetEnvironment,'alpha');
 const beta=createWorkspace({...input,targetEnvironment:'beta'},hash);beta.artwork=alpha.artwork;
 assert.match(creationArtifactSpecs(beta,'{}',hash)[0].prompt,/1280 × 720/);
 assert.notEqual(creationBriefHash(alpha,hash),creationBriefHash(beta,hash));
 assert.equal(prepareCreationTransfer(beta,'{}',hash,'restored-beta').targetEnvironment,'beta');
 assert.throws(()=>createWorkspace({...input,targetEnvironment:'unverified'},hash),/Unsupported/);
});
test('release advisories are stage and environment scoped and never change source',()=>{
 for(const wrapper of [(state:string)=>state,(state:string)=>'{"data":{"world":{"initialGameState":'+state+'}}}']){
  const state=JSON.stringify({heroesVersion:37,itemTypes:{book:{mediaContent:'x'.repeat(4001)}},parties:{main:{itemTypes:{book:{mediaContent:'y'.repeat(4001)}}}}});
  const source=wrapper(state),before=source,issues=releaseAdvisories(source,'alpha','publish');
  assert.equal(issues.length,2);assert.ok(issues.every(issue=>issue.level==='warning'&&/Upstream counting is not verified/.test(issue.message)));
  assert.ok(issues.some(issue=>issue.path.includes('parties')));
  assert.deepEqual(releaseAdvisories(source,'production','publish'),[]);assert.deepEqual(releaseAdvisories(source,'alpha','draft'),[]);assert.equal(source,before);
 }
 assert.equal(releaseAdvisories(JSON.stringify({itemTypes:{book:{mediaContent:'x'.repeat(4000)}}}),'alpha','publish').length,0);
 assert.match(releaseAdvisories(JSON.stringify({itemTypes:{book:{description:'x'.repeat(350001)}}}),'alpha','publish')[0].message,/350000/);
 assert.match(releaseAdvisories('{"resourceSettings":{}}','alpha')[0].message,/Preserve unfamiliar fields/);
});
test('persistence status distinguishes local changes, unknown saves, offline and last read-back',()=>{
 const project=create('p','World','{"heroesVersion":37,"compatibilityRevision":8}',1);
 assert.match(workspacePersistence(project),/not linked/);assert.match(workspacePersistence(project,{dirty:true}),/Unsaved/);assert.match(workspacePersistence(project,{saving:true}),/Saving local/);
 project.remote={worldId:'WORLD',environment:'production',etag:'revision',baselineHash:hash(project.activeSource),operations:[]};
 assert.match(workspacePersistence(project),/last checked/);assert.match(workspacePersistence(project,{online:false}),/offline/);
 project.remote.baselineHash='old';assert.match(workspacePersistence(project),/changes not saved/);
 project.remote.operations=[{state:'UNKNOWN'}];assert.match(workspacePersistence(project),/unconfirmed/);
 assert.deepEqual(compatibilityIdentity(project.activeSource),{heroesVersion:'37',compatibilityRevision:'8'});
 assert.equal(JSON.parse(nativeRequest(JSON.stringify({operation:'coverRecommendation',args:['alpha']}))).width,1280);
});
test('party artwork destinations retain complete paths and do not cross-assign identical names',()=>{
 const source='{ "shortId":"keep", "initialGameState":{"heroesVersion":37,"compatibilityRevision":8,"npcs":{"shared":{"name":"Shared"}},"parties":{"east":{"npcs":{"guide":{"name":"Guide","portraits":{"happy":"https://example.com/happy.png"}}},"regions":{"coast":{"name":"Coast"}},"locations":{"port":{"name":"Port","areas":{"dock":{"name":"Dock"}}}},"itemTypes":{"key":{"name":"Key"}},"premadeCharacters":[{"name":"Player"}]},"west":{"npcs":{"guide":{"name":"Guide"}}}},"exact":90071992547409931234,"other":1.2300e+42}}';
 const destinations=artworkDestinations(source),east=destinations.find(item=>item.label==='Party east · Guide')!,west=destinations.find(item=>item.label==='Party west · Guide')!;
 assert.equal(east.target,'NPC_PORTRAIT');assert.notEqual(east.id,west.id);
 assert.equal(destinations.find(item=>item.label==='Party east · Guide · happy')?.target,'NPC_PORTRAIT');
 for(const item of destinations.filter(item=>item.label.startsWith('Party '))){
  const result=assignArtwork(source,'{}',item.id,'https://example.com/art.png');assert.match(result.source,/90071992547409931234/);assert.match(result.source,/1\.2300e\+42/);
  assert.equal(artworkDestinations(result.source).find(entry=>entry.id===item.id)?.url,'https://example.com/art.png');
 }
 const assigned=assignArtwork(source,'{}',east.id,'https://example.com/east.png').source;
 assert.equal(artworkDestinations(assigned).find(item=>item.id===west.id)?.url,'');
 assert.match(artworkPrompt(destinations.find(item=>item.category==='World cover')!,'alpha'),/1280 × 720/);
 assert.equal(doc.read(assigned,['initialGameState','compatibilityRevision']),'8');
});
test('reference cache preserves same-major environments and revisions without guessing builds',()=>{
 const reference=(environment:string,revision:number,section='value')=>({section,schema:'string',schemaVersion:37,environment,compatibilityRevision:revision});
 const catalog=doc.mergeReferenceSets([reference('production',1),reference('alpha',2)],[reference('alpha',3)]);
 assert.equal(catalog.length,3);
 const source='{"heroesVersion":37,"compatibilityRevision":2}';
 assert.deepEqual(doc.selectReferences(source,catalog),[]);
 assert.equal(doc.selectReferences(source,catalog,{environment:'alpha'})[0].compatibilityRevision,2);
 assert.deepEqual(doc.selectReferences(source,catalog,{environment:'production'}),[]);
 assert.deepEqual(doc.selectReferences(source.replace(':2',':4'),catalog,{environment:'alpha'}),[]);
 const replaced=doc.mergeReferenceSets(catalog,[reference('alpha',2,'replacement')]);assert.equal(replaced.length,3);assert.equal(doc.selectReferences(source,replaced,{environment:'alpha'})[0].section,'replacement');
 const builds=[{...reference('alpha',2),engineVersion:'build-a'},{...reference('alpha',2),engineVersion:'build-b'}];
 assert.deepEqual(doc.selectReferences(source,builds,{environment:'alpha'}),[]);
 assert.equal(doc.selectReferences(source,builds,{environment:'alpha',engineVersion:'build-b'})[0].engineVersion,'build-b');
 assert.deepEqual(doc.selectReferences(source,[...catalog,{section:'value',schema:'number',schemaVersion:37}]),[]);
});
test('reference metadata envelopes normalize and reject malformed compatibility identities',()=>{
 const schema={_type:'partial',fields:{heroesVersion:{_type:'literal',value:37},value:'string'}};
 const normalized=doc.normalizeReferences({metadata:{environment:'alpha',compatibilityRevision:2,schemaVersion:37},schema});
 assert.equal(normalized[1].compatibilityRevision,2);assert.equal(normalized[0].environment,'alpha');
 for(const metadata of [{compatibilityRevision:-1},{schemaVersion:'2.55.0'},{schemaVersion:38},{engineVersion:3},{environment:'other'}])assert.throws(()=>doc.normalizeReferences({schema,metadata}));
});
test('agent schema and completion checks use their frozen environment, not a later connection',()=>{
 const source='{"heroesVersion":37,"compatibilityRevision":2,"value":1}';
 let project=create('p','World',source,1);
 project=reduce(project,{type:'remoteLink',environment:'production',worldId:'WORLD',etag:'revision',baselineHash:hash(source)});
 project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',prompt:'Inspect',route:{protocol:'codex',model:'fixture'},hostPlatform:'desktop'});
 assert.equal(project.tasks[0].referenceContext?.environment,'production');
 project=reduce(project,{type:'remoteLink',environment:'alpha',worldId:'OTHER',etag:'other',baselineHash:hash(source)});
 const references=['production','alpha'].flatMap(environment=>[
  {section:'heroesVersion',schema:{_type:'literal',value:37},schemaVersion:37,compatibilityRevision:2,environment},
  {section:'value',schema:environment==='production'?'number':'string',schemaVersion:37,compatibilityRevision:2,environment}
 ]);
 const task=project.tasks[0];
 assert.equal(executeWorldTool(project,task,'world_schema',{section:'value'},references,'unused',hash).result[0].schema,'number');
 assert.equal(executeWorldTool(project,task,'world_validate',{},references,'unused',hash).result.filter((issue:any)=>issue.level==='error').length,0);
 assert.equal(completionEvidence(task,references,hash,2).coverage,'matched');
});
