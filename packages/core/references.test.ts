import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as doc from './document';
import {nativeRequest} from './project';

const codec={_type:'intersection',parts:[
 {_type:'required',fields:{heroesVersion:{_type:'literal',value:37},npcs:{_type:'record',codomain:{_type:'partial',fields:{initialRelationship:'number',initialKnown:'boolean',portraits:{_type:'record',codomain:'string'}}}}}},
 {_type:'partial',fields:{triggerDefinitions:{_type:'record',codomain:{_type:'partial',fields:{script:'string'}}}}}
]};

test('intersection world codecs expose required and optional sections without changing field schemas',()=>{
 const sections=doc.normalizeReferences(codec);
 assert.deepEqual(sections.map(entry=>entry.section),['heroesVersion','npcs','triggerDefinitions']);
 assert.equal(doc.referenceVersion(sections),37);
 assert.equal(JSON.stringify(sections.find(entry=>entry.section==='npcs')?.schema),JSON.stringify(codec.parts[0].fields.npcs));
 const source='{"heroesVersion":37,"npcs":{"Ada":{"initialRelationship":-20,"initialKnown":true,"portraits":{"happy":"https://example.com/happy.png"}}},"unknown":9007199254740993}';
 assert.deepEqual(doc.validate(source,sections).filter(issue=>issue.level==='error'),[]);
 assert.ok(doc.validate(source.replace('"initialRelationship":-20','"initialRelationship":"bad"'),sections).some(issue=>issue.level==='error'));
});

test('normalization accepts root wrappers and legacy section collections with metadata',()=>{
 const sections=[{section:'npcs',schema:'unknown',title:'NPCs'}];
 for(const payload of [sections,{sections},{schemas:{npcs:{schema:'unknown',title:'NPCs'}}},{npcs:'unknown'}])assert.equal(doc.normalizeReferences(payload)[0].schema,'unknown');
 assert.deepEqual(doc.normalizeReferences({schema:codec}),doc.normalizeReferences(codec));
 assert.equal(doc.normalizeReferences(sections)[0].title,'NPCs');
 assert.equal(doc.referenceVersion(sections),null);
});

test('normalization preserves overlapping intersection constraints and hostile field names',()=>{
 const root=JSON.parse('{"_type":"intersection","parts":[{"_type":"partial","fields":{"__proto__":"string","setting":"number"}},{"_type":"partial","fields":{"setting":{"_type":"refined","of":"number","min":0}}}]}');
 const sections=doc.normalizeReferences(root);
 assert.equal(sections.find(entry=>entry.section==='__proto__')?.schema,'string');
 assert.deepEqual(sections.find(entry=>entry.section==='setting')?.schema,{_type:'intersection',parts:['number',{_type:'refined',of:'number',min:0}]});
});

test('invalid, duplicate, and excessive-depth schemas are rejected before installation',()=>{
 for(const payload of [null,[],{},[{section:'npcs',schema:{_type:'future'}}],[{section:'same',schema:'string'},{section:'same',schema:'number'}],{_type:'union',of:['string','number']},{_type:'literal',value:{unsafe:true}}])assert.throws(()=>doc.normalizeReferences(payload));
 let nested:any='string';
 for(let depth=0;depth<102;depth++)nested={_type:'array',of:nested};
 assert.throws(()=>doc.normalizeReferences([{section:'deep',schema:nested}]),/nesting or node limit/);
});

test('different or unspecified world versions skip incompatible checks without changing the document',()=>{
 const sections=doc.normalizeReferences(codec);
 for(const source of ['{"heroesVersion":36,"npcs":[]}', '{"heroesVersion":38,"npcs":[]}', '{"npcs":[]}', '{"heroesVersion":"37","npcs":[]}']){
  const before=source,issues=doc.validate(source,sections);
  assert.ok(issues.some(issue=>issue.level==='warning'&&/targets V37.*Schema checks were skipped/.test(issue.message)));
  assert.equal(issues.filter(issue=>issue.level==='error').length,0);
  assert.equal(source,before);
 }
 assert.ok(doc.validate('{"heroesVersion":37,"npcs":[]}',sections).some(issue=>issue.level==='error'));
});

test('the Android bridge uses the same schema parser and serializes absent versions as null',()=>{
 const sections=JSON.parse(nativeRequest(JSON.stringify({operation:'normalizeReferences',args:[codec]})));
 assert.equal(JSON.parse(nativeRequest(JSON.stringify({operation:'referenceVersion',args:[sections]}))),37);
 assert.equal(nativeRequest(JSON.stringify({operation:'referenceVersion',args:[[]]})),'null');
});
test('serialized time-of-day enums and undefined alternatives retain their actual constraints',()=>{
 const payload={_type:'partial',fields:{time:'"dawn" | "morning" | "noon"',optional:{_type:'union',of:['number','undefined']}}};
 const original=JSON.stringify(payload),sections=doc.normalizeReferences(payload);
 assert.equal(JSON.stringify(payload),original);
 assert.deepEqual(sections[0].schema,{_type:'union',of:[{_type:'literal',value:'dawn'},{_type:'literal',value:'morning'},{_type:'literal',value:'noon'}]});
 assert.equal(doc.validate('{"time":"dawn","optional":1}',sections).filter(issue=>issue.level==='error').length,0);
 assert.ok(doc.validate('{"time":"bogus"}',sections).some(issue=>issue.level==='error'));
 assert.ok(doc.validate('{"optional":"bogus"}',sections).some(issue=>issue.level==='error'));
 assert.equal(doc.validate('{}',sections).filter(issue=>issue.level==='error').length,0);
 for(const invalid of ['"dawn" | arbitraryType','unknownType','"dawn" |'])assert.throws(()=>doc.normalizeReferences([{section:'time',schema:invalid}]));
});
