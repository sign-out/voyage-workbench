import {test} from 'node:test';import assert from 'node:assert/strict';import * as f from './features';import * as d from './document';import {readFileSync} from 'node:fs';
const source='{"initialGameState":{"realms":{"Earth":{"name":"Earth"}},"regions":{},"locations":{},"unknown":9007199254740993,"npcs":{"__proto__":{"name":"__proto__","basicInfo":"old","score":1E+999}}}}';
test('header world title supports local and API shapes without altering source',()=>{
 for(const world of [{title:'  Aetheric  ',exact:9007199254740993},{title:'世界 🌍'}]){
  for(const envelope of [world,{world},{data:{world}}])assert.equal(f.worldTitle(JSON.stringify(envelope),'Save filename'),world.title.trim());
 }
 for(const missing of ['{}','{"title":" "}','{"title":42}','invalid','{"title":"Response title","world":{}}'])assert.equal(f.worldTitle(missing,'Save filename'),'Save filename');
 assert.equal(f.worldTitle('{"title":"Exact world","value":1E+999}','Save filename'),'Exact world');
});
test('publication preview reads exact public copy across world envelopes',()=>{
 const world={title:'A world',description:'Short\ncopy',advancedDescription:'Long copy\n\nSecond paragraph',image:'https://example.com/cover.png'};
 for(const [envelope,path] of [[world,[]],[{world},['world']],[{data:{world}},['data','world']]] as const){
  const preview=f.publicationInspect(JSON.stringify(envelope),'Local save');
  assert.equal(preview.description,world.description);assert.equal(preview.advancedDescription,world.advancedDescription);assert.equal(preview.coverUrl,world.image);assert.deepEqual(preview.path,path);
 }
 const exact='{"title":"Public title","unknown":9007199254740993,"image":null}';
 assert.equal(f.publicationInspect(exact,'Local save').title,'Public title');assert.equal(d.read(exact,['unknown']),'9007199254740993');
 assert.equal(f.publicationInspect('{}','Local save').title,'Local save');
 for(const image of ['javascript:alert(1)','file:///private.png','data:image/svg+xml,test','https://secret@example.com/cover.png','not a URL'])assert.equal(f.publicationInspect(JSON.stringify({image}),'Local save').coverUrl,'');
 assert.equal(f.publicationInspect('{"description":null,"advancedDescription":42}','Local save').advancedDescription,'');
});
test('map inspection provides the GameState path for coverage across envelopes',()=>{
 for(const [source,path] of [['{"heroesVersion":36}',[]],['{"initialGameState":{"heroesVersion":36}}',['initialGameState']],['{"world":{"initialGameState":{"heroesVersion":36}}}',['world','initialGameState']],['{"data":{"world":{"initialGameState":{"heroesVersion":36}}}}',['data','world','initialGameState']]] as [string,d.Path][])assert.deepEqual(f.mapInspect(source).statePath,path);
});
test('map CRUD preserves exact values and blocks collisions and occupied deletion',()=>{let s=f.mapEdit(source,'add-region',{key:'A',realm:'Earth',x:0,y:0});s=f.mapEdit(s,'add-region',{key:'B',realm:'Earth',x:1,y:0});assert.throws(()=>f.mapEdit(s,'move-region',{key:'B',x:0,y:0}),/contains/);s=f.mapEdit(s,'add-location',{key:'Port',region:'A',x:3,y:4});assert.throws(()=>f.mapEdit(s,'delete-region',{key:'A'}),/locations/);assert.throws(()=>f.mapEdit(s,'move-location',{key:'Port',x:100,y:1}),/within/);s=f.mapEdit(s,'set-settings',{regionSize:240});assert.equal(f.mapInspect(s).regionSize,240);assert.equal(d.read(s,['initialGameState','unknown']),'9007199254740993');assert.equal(d.read(s,['initialGameState','npcs','__proto__','score']),'1E+999');s=f.mapEdit(s,'set-field',{kind:'region',key:'A',field:'imageUrl',value:'https://example.com/a.png'});assert.equal(f.mapInspect(s).regions[0].imageUrl,'https://example.com/a.png');});
test('character forms preserve raw numeric fields and reject stale changes',()=>{const refs=JSON.parse(readFileSync('docs/wiki.json','utf8')),c=f.charactersInspect(source,refs).characters[0];const result=f.charactersEdit(source,c.path,{basicInfo:'new'},c.raw,refs);assert.equal(d.read(result,c.path.concat('score')),'1E+999');assert.throws(()=>f.charactersEdit(result,c.path,{basicInfo:'oops'},c.raw,refs),/changed/);assert.throws(()=>f.charactersEdit(source,c.path,{name:'different'},c.raw,refs),/record key/);const added=f.charactersCreate(source,'premade','Test');assert.equal(f.charactersInspect(added.text,refs).characters.length,2);});
test('mod export edits references only and validates versions',()=>{const s=f.modsExport(source,[{shortId:'abc',version:7}]);assert.equal(d.read(s,['initialGameState']),d.read(source,['initialGameState']));assert.deepEqual(f.modsInspect(s),[{shortId:'abc',version:7}]);assert.throws(()=>f.modsExport(source,[{shortId:'x',version:0}]),/positive/);});
test('base derivation clears authored prose while retaining exact settings numbers and limits minimization probes',()=>{const refs=JSON.parse(readFileSync('docs/wiki.json','utf8'));const source='{"heroesVersion":36,"npcs":{"A":{"name":"A","basicInfo":"Secret story"}},"customSettings":{"exact":9007199254740993,"prose":"Secret story"},"uiState":{"secret":true}}';const r=f.deriveBase(source,refs);assert(!r.text.includes('Secret story'));assert(!r.text.includes('uiState'));assert.equal(d.read(r.text,['customSettings','exact']),'9007199254740993');assert.equal(d.read(r.text,['npcs']),'{}');assert(f.minimizationQueue(r.text).every(p=>p[0]!=='heroesVersion'));assert(f.minimizationQueue(JSON.stringify(Object.fromEntries(Array.from({length:140},(_,i)=>['x'+i,{}])))).length<=120);});
