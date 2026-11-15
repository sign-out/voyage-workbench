import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractChanges,checkVoyageUpdates,curlArguments} from './check-voyage-updates.mjs';

const profiles=JSON.parse(readFileSync('packages/core/voyage-compatibility.json','utf8'));
const contractFor=url=>{
 const profile=Object.values(profiles.environments).find(profile=>url.startsWith(profile.apiBase+'/'));
 assert.ok(profile,'Request must use a configured environment');
 return readFileSync(profile.contractBaseline,'utf8');
};

test('reports nested drift even with identical version strings',()=>{
 const before={info:{version:'same'},limits:{cover:1000}},after={info:{version:'same'},limits:{cover:1280},newOperation:true};
 assert.deepEqual(contractChanges(before,after),[{path:['limits','cover'],before:1000,after:1280},{path:['newOperation'],before:null,after:true}]);
});
test('explicit curl transport disables user config, redirects and credentials',()=>{
 const args=curlArguments('https://api.aidungeon.com/creator/v1/openapi.json',{headers:{Accept:'application/json'}});
 assert.equal(args[0],'--disable');assert.ok(args.includes('GET'));assert.ok(args.includes('--max-filesize'));assert.ok(args.includes('=https'));assert.ok(!args.includes('--location'));assert.ok(!args.some(value=>/Authorization|Cookie|Origin/.test(value)));
 assert.throws(()=>curlArguments('https://other.test/openapi.json'));
 assert.ok(curlArguments('https://api-beta.aidungeon.com/creator/v1/openapi.json').includes('https://api-beta.aidungeon.com/creator/v1/openapi.json'));
 assert.throws(()=>curlArguments('https://api-beta.aidungeon.com/creator/v1/worlds'));
 assert.throws(()=>curlArguments('https://api-beta.aidungeon.com.evil.test/creator/v1/openapi.json'));
});
test('offline checks require no network or credentials',async()=>{
 const report=await checkVoyageUpdates({offline:true,fetcher:()=>{throw Error('Network forbidden');}});
 assert.equal(report.offline,true);for(const environment of ['production','alpha','beta'])assert.equal(report.environments[environment].baselineChanges.length,0);assert.equal(report.requiresReview,false);assert.equal(report.differences.length,3);assert.equal(report.environmentDifferences.beta.length,3);
});
test('live checker uses only public documentation and flags contract/guide disagreement',async()=>{
 const calls=[],contract=JSON.parse(readFileSync('docs/openapi.json','utf8')),guide=readFileSync('docs/voyage-agent-guide.md','utf8');
 const report=await checkVoyageUpdates({fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('.md'))return new Response(guide);const value=structuredClone(contract);if(url.includes('api-alpha')){value['x-media-constraints'].targets.WORLD_COVER.recommendedWidth=1280;value['x-media-constraints'].targets.WORLD_COVER.recommendedHeight=720;}return new Response(JSON.stringify(value));}});
 assert.equal(calls.length,6);for(const call of calls){assert.equal(call.options.method,undefined);assert.deepEqual(Object.keys(call.options.headers),['Accept']);assert.equal(call.options.redirect,'error');}
 assert.equal(calls.filter(call=>call.url.startsWith('https://api-beta.aidungeon.com/creator/v1/')).length,2);
 assert.equal(report.requiresReview,true);assert.equal(report.differences.length,2);assert.ok(report.warnings.some(warning=>warning.includes('disagree')));
});
test('failed fetch and malformed contracts fail rather than claiming compatibility',async()=>{
 await assert.rejects(checkVoyageUpdates({fetcher:async()=>new Response('Unavailable',{status:503})}),/HTTP 503/);
 await assert.rejects(checkVoyageUpdates({fetcher:async(url)=>new Response(url.endsWith('.md')?'Creator API':'{}')}),/Unexpected production/);
});
test('world codec updates are reported section-by-section without claiming engine parity',async()=>{
 const guide=readFileSync('docs/voyage-agent-guide.md','utf8');
 const schema=JSON.parse(readFileSync('docs/references/voyage-v37-community.json','utf8'));
 const report=await checkVoyageUpdates({schema:true,fetcher:async url=>{
  if(url.endsWith('/schema.json')){schema.parts.push({_type:'partial',fields:{futureFeature:'string'}});return new Response(JSON.stringify(schema));}
  return new Response(url.endsWith('.md')?guide:contractFor(url));
 }});
 assert.equal(report.requiresReview,true);assert.deepEqual(report.worldSchema.changedSections,['futureFeature']);assert.equal(report.worldSchema.heroesVersion,37);assert.match(report.worldSchema.authority,/not official/);
});
test('guide-only and beta-only drift trigger review independently of API version strings',async()=>{
 const report=await checkVoyageUpdates({fetcher:async url=>new Response(url.endsWith('.md')?'Creator API workflow changed':contractFor(url))});
 assert.equal(report.requiresReview,true);for(const environment of Object.keys(profiles.environments)){assert.equal(report.environments[environment].guideChanged,true);assert.equal(report.environments[environment].baselineChanges.length,0);}
 const beta=await checkVoyageUpdates({fetcher:async url=>{
  if(url.endsWith('.md'))return new Response(readFileSync('docs/voyage-agent-guide.md','utf8'));
  const contract=JSON.parse(contractFor(url));if(url.startsWith(profiles.environments.beta.apiBase+'/'))contract['x-media-constraints'].targets.WORLD_COVER.recommendedWidth=1600;
  return new Response(JSON.stringify(contract));
 }});
 assert.equal(beta.requiresReview,true);assert.equal(beta.environments.beta.version,'1.3.0-preview');assert.equal(beta.environments.beta.guideChanged,false);assert.equal(beta.environments.beta.baselineChanges.length,1);
 assert.deepEqual(beta.environments.beta.baselineChanges[0].path,['x-media-constraints','targets','WORLD_COVER','recommendedWidth']);
 assert.equal(beta.environments.alpha.baselineChanges.length,0);assert.equal(beta.environments.production.baselineChanges.length,0);
 assert.equal(beta.environmentDifferences.beta.find(change=>change.path.at(-1)==='recommendedWidth').after,1600);
});
