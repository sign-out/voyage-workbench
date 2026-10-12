import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authoringPreferences} from '../../../packages/core/authoring';
import {create} from '../../../packages/core/project';
import {AuthoringSettings,readAuthoring} from './AuthoringSettings';
import {AuthoringWorkbench,ContextualGuidance} from './AuthoringWorkbench';
import {ScopePicker} from './ScopePicker';
import {CheckpointTools} from './CheckpointTools';
import {pageOffset} from './paging';
test('pagination cannot strand results after removals or filter changes',()=>{assert.equal(pageOffset(20,8,10),0);assert.equal(pageOffset(20,11,10),10);assert.equal(pageOffset(20,0,10),0);assert.equal(pageOffset(10,21,10),10);});
test('authoring settings expose conservative adjustable defaults without safety switches',()=>{
 const html=renderToStaticMarkup(<AuthoringSettings value={authoringPreferences(null)} onChange={()=>{}}/>);for(const label of ['Completeness advisory sections','Recent entries','Proposal review grouping','Reference impact filter','Asset inventory filter','Default batch field','Include builder notes'])assert.match(html,new RegExp(label));assert.match(html,/Preservation and explicit review cannot be disabled/);assert.equal(readAuthoring({getItem:()=>'{bad'}).recentLimit,10);
});
test('scope picker makes whole-world permission explicit and treats paths as a peer advanced view',()=>{
 const html=renderToStaticMarkup(<ScopePicker source='{"initialGameState":{"npcs":{}}}' currentPath={['initialGameState','npcs']} value='[]' wholeWorld={false} onChange={()=>{}} compute={async()=>({entries:[],total:0})} preferences={authoringPreferences(null)}/>);assert.match(html,/0 selected paths/);assert.match(html,/Allow the whole authored world/);assert.match(html,/Package identity stays protected/);assert.match(html,/advanced JSON/);assert.doesNotMatch(html,/checked=""/);
});
test('authoring workspace exposes approved tools with separate project bookmarks',()=>{
 const project=create('p','World','{"npcs":{"m":{"name":"M"}}}',1);project.bookmarks=[{id:'b',name:'<Bookmark>',path:['npcs','m']}];const html=renderToStaticMarkup(<AuthoringWorkbench project={project} path={['npcs','m']} references={[]} preferences={authoringPreferences(null)} compute={async()=>({})} command={async()=>{}} onNavigate={async()=>{}} onReview={()=>{}} busy={false} recent={[]}/>);for(const text of ['Completeness','Reference impact','Asset inventory','Duplicate entry','Batch edit','Project bookmarks'])assert.match(html,new RegExp(text));assert.match(html,/&lt;Bookmark&gt;/);assert.match(html,/paths into arrays are positional/i);
});
test('guidance describes missing schema instead of declaring custom fields invalid',()=>{
 const html=renderToStaticMarkup(<ContextualGuidance source='{"custom":{}}' path={['custom']} references={[]}/>);assert.match(html,/No cached guidance/);assert.match(html,/scripts are never executed/i);
});
test('checkpoint controls preserve reviewed restore and comparison labeling',()=>{
 const html=renderToStaticMarkup(<CheckpointTools project={create('p','World','{}',1)} history={[{id:'h',label:'Before <edit>',created:1,size:2}]} onHistory={()=>{}} onRestore={async()=>{}} compute={async()=>({})} busy={false}/>);assert.match(html,/Save labeled checkpoint/);assert.match(html,/Compare selected revisions/);assert.match(html,/Review restore/);assert.match(html,/Rename label/);assert.match(html,/Before &lt;edit&gt;/);
});
