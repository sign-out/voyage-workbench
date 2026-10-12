import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {edit,insert,read,remove} from '../../../packages/core/document';
import {schemaAt,schemaFields,enumValues,initialValue,moveArrayItem,type Schema} from './structured-source';
import {StructuredEditor} from './StructuredEditor';
import {ValueEditor} from './ValueEditor';

const schema:Schema={_type:'intersection',parts:[{_type:'required',fields:{worldBackground:'string'}},{_type:'partial',fields:{questGenerationGuidance:'string'}}]};
test('schema traversal resolves fields, records, arrays and enums without inventing defaults',()=>{
 assert.deepEqual(Object.keys(schemaFields(schema)),['worldBackground','questGenerationGuidance']);
 assert.equal(schemaAt({_type:'record',codomain:schema},['lore','worldBackground']),'string');
 assert.equal(schemaAt({_type:'array',of:'string'},[3]),'string');
 assert.deepEqual(enumValues({_type:'union',of:[{_type:'literal',value:'basic'},{_type:'literal',value:'detailed'}]}),['basic','detailed']);
 assert.equal(initialValue({_type:'array',of:'string'}),'[]');
});
test('field edits, additions, removals and array reordering preserve exact unknown source',()=>{
 const source='{ "worldBackground":"Before", "unknown": {"id":90071992547409931234,"scale":1.2300e+42}, "list":["a",9007199254740993,"b"] }';
 const changed=edit(source,['worldBackground'],JSON.stringify('After\nMore'));
 assert.equal(read(changed,['unknown']),read(source,['unknown']));
 assert.equal(read(changed,['list']),read(source,['list']));
 const added=insert(changed,[],'questGenerationGuidance',JSON.stringify('Guidance'));
 assert.equal(read(added,['unknown']),read(source,['unknown']));
 const moved=moveArrayItem(added,['list'],1,-1);
 assert.equal(read(moved,['list',0]),'9007199254740993');
 assert.equal(read(moveArrayItem(moved,['list'],0,1),['list']),read(source,['list']));
 assert.equal(read(remove(added,['questGenerationGuidance']),['unknown']),read(source,['unknown']));
 assert.throws(()=>moveArrayItem(source,['list'],0,-1));
});
test('Form and JSON use an always-available single toolbar toggle for every value type',()=>{
 for(const text of ['{}','[]','"text"','true','9007199254740993','null']){
  const markup=renderToStaticMarkup(<ValueEditor text={text} onChange={()=>{}}/>);
  assert.ok(markup.includes('Switch to JSON view'));assert.ok(!markup.includes('advanced fallback'));
 }
 const invalid='{ "unfinished":';
 const markup=renderToStaticMarkup(<ValueEditor text={invalid} onChange={()=>{}}/>);
 assert.ok(markup.includes('Switch to Form view'));assert.ok(markup.includes('JSON source'));assert.ok(markup.includes('unfinished'));
});
test('forms preserve unknown fields, expose exact numbers and never populate absent fields on render',()=>{
 const text='{"worldBackground":"Long text", "custom":9007199254740993}',changes:string[]=[];
 const markup=renderToStaticMarkup(<StructuredEditor text={text} schema={schema} onChange={value=>changes.push(value)}/>);
 assert.ok(markup.includes('World Background'));assert.ok(markup.includes('9007199254740993'));assert.ok(markup.includes('Custom'));assert.ok(markup.includes('Add Quest Generation Guidance'));assert.deepEqual(changes,[]);
 const locked=renderToStaticMarkup(<StructuredEditor text={text} schema={schema} readOnly onChange={()=>{}}/>);
 assert.ok(locked.includes('readOnly'));assert.ok(!locked.includes('Add a field'));
});
test('record collections include searchable names, real counts, explicit addition and read-only safeguards',()=>{
 const text='{"guide":{"name":"Guide","text":"Lore"},"other":{"text":"Other"}}';
 const record:Schema={_type:'record',codomain:{_type:'partial',fields:{name:'string',text:'string'}}};
 const markup=renderToStaticMarkup(<StructuredEditor text={text} schema={record} onChange={()=>{}}/>);
 assert.ok(markup.includes('Search entries'));assert.ok(markup.includes('2 of 2 entries'));assert.ok(markup.includes('Guide'));assert.ok(markup.includes('New entry ID'));
 const locked=renderToStaticMarkup(<StructuredEditor text={text} schema={record} readOnly onChange={()=>{}}/>);
 assert.ok(!locked.includes('Add entry'));assert.ok(locked.includes('disabled'));
});
test('large collections render bounded pages and nested objects mount only when expanded',()=>{
 const list='['+Array.from({length:75},(_,index)=>JSON.stringify('Entry '+index)).join(',')+']';
 const markup=renderToStaticMarkup(<StructuredEditor text={list} onChange={()=>{}}/>);
 assert.equal((markup.match(/class="form-entry"/g)||[]).length,50);assert.ok(markup.includes('75 of 75 entries'));assert.ok(markup.includes('25 remaining'));
 const nested=renderToStaticMarkup(<StructuredEditor text='{"nested":{"text":"Lazy content"}}' onChange={()=>{}}/>);
 assert.ok(nested.includes('Nested'));assert.ok(!nested.includes('Lazy content'));
});
