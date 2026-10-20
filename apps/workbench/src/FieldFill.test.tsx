import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {create,type Task} from '../../../packages/core/project';
import {edit,read,remove} from '../../../packages/core/document';
import {fieldFillSnapshot,undoFieldFill} from '../../../packages/core/field-fill';
import {applyEditorFill,editorFillCandidates,fieldFillHighlights,FieldFillDialog,newTextDefaults,withoutFieldFillSubtree} from './FieldFill';
import {moveArrayItem} from './structured-source';
import {ValueEditor} from './ValueEditor';
import {TextField} from './TextField';

test('wands are optional, accessible siblings and absent in read-only editors',()=>{
 const project=create('p','World','{"description":"","id":"","imageUrl":"","name":"Authored"}',1);
 const options={project,onStart:async()=>{},onStop:async()=>{}};
 const plain=renderToStaticMarkup(<ValueEditor text={project.activeSource} onChange={()=>{}}/>);
 assert.doesNotMatch(plain,/Generate missing text/);
 const enabled=renderToStaticMarkup(<ValueEditor text={project.activeSource} onChange={()=>{}} fieldFill={options}/>);
 assert.match(enabled,/aria-label="Generate missing text for Description"/);
 assert.doesNotMatch(enabled,/Generate missing text for (Id|Image Url|Name)/);
 assert.doesNotMatch(enabled,/<label[^>]*>(?:(?!<\/label>)[\s\S])*<button/);
 assert.doesNotMatch(enabled,/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
 const readOnly=renderToStaticMarkup(<ValueEditor text={project.activeSource} onChange={()=>{}} fieldFill={options} readOnly/>);
 assert.doesNotMatch(readOnly,/Generate missing text/);
 const standalone=renderToStaticMarkup(<TextField title="Notes" value="Existing" readOnly={false} onChange={()=>{}}/>);
 assert.match(standalone,/Expand Notes/);assert.doesNotMatch(standalone,/Fill text/);
});
test('active project tasks lock generation without allowing cancellation of a different task',()=>{
 const project=create('p','World','{"description":""}',1);
 project.tasks=[{id:'other',state:'RUNNING'} as Task];
 const html=renderToStaticMarkup(<ValueEditor text={project.activeSource} onChange={()=>{}} fieldFill={{project,onStart:async()=>{},onStop:async()=>{}}}/>);
 assert.match(html,/aria-label="Generate missing text for Description"[^>]*disabled=""/);
 assert.doesNotMatch(html,/Cancel generation/);
});
test('explicit instructions dialog explains configured provider, charges and draft-only application',()=>{
 const html=renderToStaticMarkup(<FieldFillDialog title="Description" count={3} busy={false} onStart={()=>{}} onClose={()=>{}}/>);
 assert.match(html,/class="field-fill-dialog"/);assert.match(html,/aria-describedby="[^"]+"/);
 assert.match(html,/<textarea[^>]*required=""/);assert.match(html,/<label for="[^"]+">Instructions/);
 for(const phrase of ['3 eligible prose fields','Planning provider','Models &amp; agents','may charge','never the active world','Generate text'])assert.ok(html.includes(phrase),phrase);
 assert.match(html,/<button type="submit"[^>]*disabled=""/);
});
test('UI schema filters blank enums and keeps provenance scoped to newly created strings',()=>{
 const source='{"entry":{"description":"","title":"","id":""},"other":{"description":""}}';
 const defaults=[...newTextDefaults('""',['entry','description'],'string'),...newTextDefaults('""',['entry','id'],'string'),...newTextDefaults('""',['other','description'],'string')];
 assert.deepEqual(newTextDefaults('"Imported prose"',['entry','description']),[]);
 assert.deepEqual(editorFillCandidates(source,['entry'],['entry'],{fields:{title:{_type:'union',of:[{_type:'literal',value:''},{_type:'literal',value:'Fixed'}]}}},undefined,defaults).map(field=>field.path),[['entry','description']]);
 assert.equal(editorFillCandidates(source,['entry','description'],['entry'],undefined,undefined,defaults).length,1);
 const changed=edit(source,['entry','description'],'"Manual"');
 assert.equal(editorFillCandidates(changed,['entry','description'],['entry'],undefined,undefined,defaults).length,0);
});
test('result application respects absolute selection, frozen before values and safe undo',()=>{
 const source='{"entry":{"description":"","title":""},"other":{"description":""},"precise":9007199254740993}';
 const snapshot=fieldFillSnapshot({source,path:[],instructions:'Make it atmospheric'});
 const task={id:'own',state:'COMPLETED',fieldFill:{...snapshot,result:[{path:['entry','description'],value:'Generated prose'},{path:['entry','title'],value:'Generated title'},{path:['other','description'],value:'Other prose'}]}} as Task;
 const current=edit(source,['entry','title'],'"Manually authored while running"');
 const applied=applyEditorFill(current,['entry'],task,[['entry','description'],['entry','title']]);
 assert.deepEqual(applied.changes,[{path:['entry','description'],before:'',after:'Generated prose'}]);
 assert.equal(applied.skipped,2);assert.equal(read(applied.source,['other','description']),'""');
 assert.match(applied.source,/9007199254740993/);assert.match(applied.text,/Manually authored while running/);
 const later=edit(applied.source,['entry','description'],'"Later edit"');
 assert.equal(undoFieldFill(later,applied.changes).source,later);
 assert.equal(read(undoFieldFill(applied.source,applied.changes).source,['entry','description']),'""');
 assert.throws(()=>applyEditorFill('incomplete',['entry'],task,[['entry','description']]));
});
test('structural edits clear collection defaults rather than retarget authored placeholders',()=>{
 const source='{"people":[{"id":"a","description":"Placeholder"},{"id":"b","description":"Placeholder"}],"description":"Other default"}';
 const defaults=[...newTextDefaults('"Placeholder"',['people',0,'description'],'string'),...newTextDefaults('"Other default"',['description'],'string')];
 for(const changed of [moveArrayItem(source,['people'],0,1),remove(source,['people',0])]){
  const remaining=withoutFieldFillSubtree(defaults,['people']);
  assert.deepEqual(remaining,[{path:['description'],value:'Other default'}]);
  assert.deepEqual(editorFillCandidates(changed,['people'],[],undefined,undefined,remaining),[]);
 }
 const objectDefaults=[{path:['records','a','description'],value:'A'},{path:['records','b','description'],value:'B'}];
 assert.deepEqual(withoutFieldFillSubtree(objectDefaults,['records','a']),[objectDefaults[1]]);
});
test('generated highlights obey identity guards after array reorder and removal',()=>{
 const source='{"people":[{"id":"a","description":""},{"id":"b","description":"Generated"}],"description":""}';
 const fieldFill=fieldFillSnapshot({source,path:[],instructions:'Write prose'});
 const task={id:'own',state:'COMPLETED',fieldFill:{...fieldFill,result:[{path:['people',0,'description'],value:'Generated'},{path:['description'],value:'Outside'}]}} as Task;
 const applied=applyEditorFill(source,[],task,fieldFill.fields.map(field=>field.path));
 assert.equal(fieldFillHighlights(applied.source,applied.changes).size,2);
 for(const changed of [moveArrayItem(applied.source,['people'],0,1),remove(applied.source,['people',0])]){
  assert.deepEqual([...fieldFillHighlights(changed,applied.changes)],['["description"]']);
  assert.deepEqual(withoutFieldFillSubtree(applied.changes,['people']).map(change=>change.path),[['description']]);
 }
 assert.equal(fieldFillHighlights('incomplete',applied.changes).size,0);
});
