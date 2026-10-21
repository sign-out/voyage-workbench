import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import references from './work-validation.json';
import {validate} from './document';

test('automatic work validation snapshot matches every cached community schema and section',()=>{
 const wiki=JSON.parse(readFileSync(new URL('../../docs/wiki.json',import.meta.url),'utf8'));
 assert.deepEqual(references,wiki.filter((reference:any)=>reference.schema).map(({section,schema}:any)=>({section,schema})));
 assert(validate('{"initialGameState":{"combatSettings":"unsafe"}}',references).some(issue=>issue.level==='error'));
});
