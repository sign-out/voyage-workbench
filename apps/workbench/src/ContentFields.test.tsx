import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ContentFields,groupContentFields,type ContentField} from './ContentFields';

const fields:ContentField[]=['regions','skills','aiInstructions','gameplayMusicSettings','customExtension','locationSettings'].map(key=>({key,kind:'object',preview:'Object'}));
const references=[{section:'regions',title:'Regions',tab:'world'},{section:'skills',title:'Skills',tab:'mechanics'},{section:'aiInstructions',title:'AI Instructions',tab:'ai'},{section:'gameplayMusicSettings',title:'Music',tab:'other'},{section:'locationSettings',title:'Location Settings',tab:'other',uiLocation:'Files → Other → Advanced → Location Settings'}];
test('content categories preserve every present field exactly once, including unknown fields',()=>{
 const groups=groupContentFields(fields,references);assert.deepEqual(groups.map(group=>group.title),['World','Mechanics','AI','Music','Other']);assert.deepEqual(groups.map(group=>group.fields.length),[1,1,1,1,2]);assert.deepEqual(groups.flatMap(group=>group.fields).map(field=>field.key).sort(),fields.map(field=>field.key).sort());
});
test('older cached references without categories still group known world fields',()=>{
 const legacy=references.map(({section,title})=>({section,title}));assert.deepEqual(groupContentFields(fields,legacy).map(group=>group.fields.length),[1,1,1,1,2]);assert.deepEqual(groupContentFields(fields,[]).map(group=>group.fields.length),[1,1,1,1,2]);
});
test('grouped content uses friendly names, real counts and advanced disclosures without inventing state',()=>{
 const markup=renderToStaticMarkup(<ContentFields fields={fields} references={references} path={['initialGameState']} grouped onNavigate={()=>{}}/>);assert.equal((markup.match(/<button/g)||[]).length,fields.length);assert.ok(markup.includes('customExtension'));assert.ok(markup.includes('AI Instructions'));assert.ok(markup.includes('content-advanced'));assert.ok(!markup.includes('shortId'));assert.ok(!markup.includes('loadStatus'));
});
