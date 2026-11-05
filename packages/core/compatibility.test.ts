import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as doc from './document';
import {compatibilityFieldUpdates,referenceImpact} from './authoring';
import {create,reduce,hash,nativeRequest} from './project';
import {imageTargets} from './artwork';

test('offline catalog selects matched versions and discloses unknown and legacy coverage',()=>{
 const catalog=[{section:'legacy',schema:'string',schemaVersion:36},{section:'heroesVersion',schema:{_type:'literal',value:37},schemaVersion:37},{section:'current',schema:'number',schemaVersion:37}];
 assert.deepEqual(doc.selectReferences('{"heroesVersion":36}',catalog).map(entry=>entry.section),['legacy']);
 assert.deepEqual(doc.selectReferences('{"initialGameState":{"heroesVersion":37}}',catalog).map(entry=>entry.section),['heroesVersion','current']);
 for(const source of ['{"heroesVersion":38,"current":"preserve"}','{"current":"preserve"}','{"heroesVersion":"37"}']){
  assert.deepEqual(doc.selectReferences(source,catalog),[]);
  assert.ok(doc.validate(source,catalog).some(issue=>/No matching cached schema/.test(issue.message)));
  assert.equal(doc.validate(source,catalog).filter(issue=>issue.level==='error').length,0);
 }
 assert.ok(doc.validate('{"heroesVersion":36}',catalog).some(issue=>/advisory section coverage/.test(issue.message)));
 assert.ok(doc.validate('{"heroesVersion":37,"current":"bad"}',catalog).some(issue=>issue.level==='error'));
 assert.equal(doc.schemaGuidance('{"heroesVersion":38}',catalog,'current')[0].available,false);
 assert.equal(doc.schemaGuidance('{"heroesVersion":37}',catalog,'absent')[0].schema,null);
 assert.equal(doc.schemaGuidance('{"heroesVersion":37}',catalog,'current')[0].schema,'number');
});

test('reference catalogs retain other versions across refresh and restart',()=>{
 const bundled=[{section:'legacy',schema:'string',schemaVersion:36},{section:'old',schema:'string',schemaVersion:37}];
 const fresh=[{section:'heroesVersion',schema:{_type:'literal',value:38}},{section:'future',schema:'number'}];
 const merged=doc.mergeReferenceSets(bundled,fresh);
 assert.equal(doc.selectReferences('{"heroesVersion":37}',merged)[0].section,'old');
 assert.equal(doc.selectReferences('{"heroesVersion":38}',merged).length,2);
 assert.deepEqual(doc.mergeReferenceSets(bundled,JSON.parse(JSON.stringify(merged))),merged);
 const replaced=doc.mergeReferenceSets(merged,[{section:'heroesVersion',schema:{_type:'literal',value:37}}]);
 assert.equal(doc.selectReferences('{"heroesVersion":37}',replaced).length,1);
 assert.equal(doc.selectReferences('{"heroesVersion":38}',replaced).length,2);
 assert.deepEqual(JSON.parse(nativeRequest(JSON.stringify({operation:'selectReferences',args:['{"heroesVersion":38}',merged]}))),doc.selectReferences('{"heroesVersion":38}',merged));
});

test('bundled snapshot fingerprint and normalized version are independently checked',()=>{
 const snapshot=readFileSync('docs/references/voyage-v37-community.json','utf8');
 const meta=JSON.parse(readFileSync('docs/references/voyage-v37-community.meta.json','utf8'));
 assert.equal(createHash('sha256').update(snapshot).digest('hex'),meta.bundledSha256);
 assert.equal(createHash('sha256').update(snapshot.replace(/\n$/,'')).digest('hex'),meta.sha256);
 assert.equal(doc.referenceVersion(doc.normalizeReferences(JSON.parse(snapshot))),37);
});

test('image targets match both allowance and moderation in the retained Alpha contract',()=>{
 const snapshot=readFileSync('docs/references/creator-alpha-1.3.0-preview.openapi.json','utf8');
 const meta=JSON.parse(readFileSync('docs/references/creator-alpha-1.3.0-preview.meta.json','utf8'));
 assert.equal(createHash('sha256').update(snapshot).digest('hex'),meta.bundledSha256);
 assert.equal(createHash('sha256').update(snapshot.replace(/\n$/,'')).digest('hex'),meta.sha256);
 const contract=JSON.parse(snapshot);assert.equal(contract.info.version,meta.version);
 for(const path of ['/uploads','/worlds/{shortId}/uploads/{uploadId}/moderate'])assert.deepEqual(contract.paths[path].post.requestBody.content['application/json'].schema.properties.target.enum.slice().sort(),Object.keys(imageTargets).sort());
});

const source='{ "shortId":"fixed", "initialGameState": {"heroesVersion":37,"compatibilityRevision":9,"npcs":{"ada":{"relationship" : -1.2300e+42,"known":false,"extra":9007199254740993}},"quests":{"q":{"initialStatus":"available"}},"unknown":{"known":true}} }';
test('reviewed V37 field updates rename keys only and preserve exact values and metadata',()=>{
 const preview=compatibilityFieldUpdates(source);
 assert.equal(preview.blockers.length,0);assert.equal(preview.changes.length,3);
 assert.equal(preview.source,source.replace('"relationship"','"initialRelationship"').replace('"known"','"initialKnown"').replace('"initialStatus"','"status"'));
 assert.equal(compatibilityFieldUpdates(preview.source).changes.length,0);
 assert.equal(compatibilityFieldUpdates(source.replace('"heroesVersion":37','"heroesVersion":3.7e1')).changes.length,3);
 let project=create('p','World',source,1);
 project=reduce(project,{type:'compatibilityProposal',id:'review',baseHash:hash(source)});
 assert.equal(project.activeSource,source);assert.equal(project.candidates.length,1);
 assert.throws(()=>reduce(project,{type:'compatibilityProposal',id:'stale',baseHash:'stale'}));
 project=reduce(project,{type:'accept',id:'review'});
 assert.equal(project.activeSource,preview.source);
});

test('field updates stop atomically on version, type, enum and destination conflicts',()=>{
 for(const value of [source.replace('"heroesVersion":37','"heroesVersion":36'),source.replace('"known":false','"known":false,"initialKnown":true'),source.replace('"known":false','"known":"false"'),source.replace('"available"','"invented"')]){
  const result=compatibilityFieldUpdates(value);assert.ok(result.blockers.length);assert.equal(result.source,value);
  assert.throws(()=>reduce(create('p','World',value,1),{type:'compatibilityProposal',id:'r',baseHash:hash(value)}));
 }
 assert.equal(compatibilityFieldUpdates(source.replace('"known"','"kn\\u006fwn"')).source,compatibilityFieldUpdates(source).source);
});

test('trait gate impact supports arrays, Story Starts, missing targets and advisory self-links',()=>{
 const source='{"initialGameState":{"traits":{"a":{"unlockedBy":["b","start","mod-trait"],"excludedBy":["a"]},"b":{}},"storyStarts":{"start":{}}}}';
 const report=referenceImpact(source,['initialGameState','traits','a'],'outgoing');
 assert.equal(report.total,4);assert.equal(report.links.filter(link=>link.missing).length,1);
 assert.deepEqual(report.links[1].to,['initialGameState','storyStarts','start']);
 assert.deepEqual(report.links[2].from,['initialGameState','traits','a','unlockedBy',2]);
 assert.equal(referenceImpact(source,['initialGameState','traits','b'],'incoming').total,1);
 const issues=doc.validate(source);assert.ok(issues.some(issue=>/mod or at runtime/.test(issue.message)));assert.ok(issues.some(issue=>/points to itself/.test(issue.message)));assert.equal(issues.filter(issue=>issue.level==='error').length,0);
 assert.equal(referenceImpact('{"traits":{"a":{"unlockedBy":"not-an-array","excludedBy":[3,null,{}]}}}',[]).total,0);
});
