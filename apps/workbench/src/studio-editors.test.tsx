import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {at,parse,read} from '../../../packages/core/document';
import {referenceCatalog,referenceTarget,healthSummary,safeImageUrl,entryImage} from './world-references';
import {StructuredEditor} from './StructuredEditor';
import {JsonEditor} from './JsonEditor';
import {formatJson,highlightJson} from './json-highlight';

const world='{"initialGameState":{"npcs":{"guide":{"name":"Guide","currentLocation":"port","currentArea":"pier","faction":"guild","hpCurrent":25,"hpMax":50}},"locations":{"port":{"name":"Port","areas":{"pier":{"name":"Pier"}}},"hill":{"name":"Hill","areas":{"pier":{"name":"Hill pier"}}}},"factions":{"guild":{"name":"Guild"}},"worldVoices":{"calm":{"label":"Calm voice"}}}}';
test('reference catalog extracts names and location-scoped areas without altering exact source',()=>{
 const catalog=referenceCatalog(world);assert.deepEqual(catalog.factions,[{id:'guild',name:'Guild'}]);assert.deepEqual(catalog.worldVoices,[{id:'calm',name:'Calm voice'}]);assert.deepEqual(catalog.areas,[{id:'pier',name:'Pier',parent:'port'},{id:'pier',name:'Hill pier',parent:'hill'}]);
 assert.deepEqual(referenceCatalog('{unfinished'),{});
 assert.equal(referenceTarget('npcs',['guide','currentLocation']),'locations');assert.equal(referenceTarget('locations',['port','factions',0]),'factions');assert.equal(referenceTarget(undefined,['initialGameState','regions','coast','realm']),'realms');assert.equal(referenceTarget('storySettings',['faction']),undefined);
});
test('reference controls preserve unknown IDs and offer only areas from the current location',()=>{
 const raw='{"currentLocation":"port","currentArea":"runtime-area","faction":"unknown-guild"}';
 const markup=renderToStaticMarkup(<StructuredEditor text={raw} worldSource={world.replace('"currentArea":"pier"','"currentArea":"runtime-area"')} section="npcs" basePath={['initialGameState','npcs','guide']} onChange={()=>{}}/>);
 assert.ok(markup.includes('Port'));assert.ok(markup.includes('Guild'));assert.ok(markup.includes('value="unknown-guild"'));assert.ok(markup.includes('value="runtime-area"'));assert.ok(markup.includes('may be supplied at runtime'));assert.ok(markup.includes('Pier'));assert.ok(!markup.includes('Hill pier'));
 const locked=renderToStaticMarkup(<StructuredEditor text={raw} worldSource={world} section="npcs" basePath={['initialGameState','npcs','guide']} readOnly onChange={()=>{}}/>);assert.ok(locked.includes('readOnly'));
});
test('health presentation preserves lexical values and skips unsafe or noninteger ratios',()=>{
 const source='{"hpCurrent":25,"hpMax":50}';assert.deepEqual(healthSummary(source,parse(source)),{current:'25',maximum:'50',percentage:50});
 for(const value of ['90071992547409931234','1.0000000000000000000001','1e999','-1']){
  const text='{"hpCurrent":'+value+',"hpMax":100}';assert.equal(healthSummary(text,parse(text))?.current,value);assert.equal(healthSummary(text,parse(text))?.percentage,undefined);
 }
 assert.equal(healthSummary('{}',parse('{}')),undefined);
});
test('collection imagery uses credential-free HTTP URLs and rejects executable or local URLs',()=>{
 for(const url of ['javascript:alert(1)','file:///private/key','https://user:secret@example.com/a.png','data:image/png;base64,abc'])assert.equal(safeImageUrl(url),'');
 assert.equal(entryImage(parse('{"images":{"map":{"imageUrl":"https://example.com/map.png"}}}')),'https://example.com/map.png');
 const markup=renderToStaticMarkup(<StructuredEditor text='{"basicInfo":"Long text","hpCurrent":25,"hpMax":50}' onChange={()=>{}}/>);assert.ok(markup.includes('Expand Basic Info'));assert.ok(markup.includes('Health percentage'));assert.ok(markup.includes('50%'));
});
test('JSON highlighting is a lossless rendering for valid, invalid, escaped and large numeric source',()=>{
 for(const source of [' {"id":90071992547409931234,"scale":1.2300e+42,"flag":true,"text":"a\\\"b"}\n','{"incomplete":','{"html":"<script>&unsafe</script>"}','"'+'x'.repeat(262145)+'"'])assert.equal(highlightJson(source).map(token=>token.text).join(''),source);
 const markup=renderToStaticMarkup(<JsonEditor text='{"id":90071992547409931234}' readOnly={false} onChange={()=>{}}/>);assert.ok(markup.includes('JSON source'));assert.ok(markup.includes('json-token-key'));assert.ok(markup.includes('json-token-number'));assert.ok(markup.includes('json-line-numbers'));
 const escaped=renderToStaticMarkup(<JsonEditor text='"<script>"' readOnly onChange={()=>{}}/>);assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('readOnly'));
});
test('explicit JSON formatting preserves every scalar token including escaped keys and huge numbers',()=>{
 const text=' {"a:b": [{"\\u006bid":90071992547409931234,"text":"a\\u0062","negative":-0,"huge":1E+999}],"empty":{}} ';
 const formatted=formatJson(text);assert.ok(formatted.includes('\n'));assert.ok(formatted.includes('"\\u006bid"'));
 for(const key of ['kid','text','negative','huge'])assert.equal(read(formatted,['a:b',0,key]),read(text,['a:b',0,key]));
 assert.deepEqual(at(parse(formatted),['empty']).children,[]);assert.throws(()=>formatJson('{"unfinished":'));
});
