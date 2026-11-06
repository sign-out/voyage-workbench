import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '../../../packages/core/project';
import {RemoteSaveReview} from './RemoteSaveReview';
import {WorldExportButtons} from './WorldExports';

test('mismatched saves offer read-only review and do not call it confirmed',()=>{
 const project=create('p','World','{}',1);
 assert.equal(renderToStaticMarkup(<RemoteSaveReview project={project} onReview={()=>{}}/>),'');
 project.remote.operations=[{state:'UNKNOWN',comparison:{total:53}}];
 const html=renderToStaticMarkup(<RemoteSaveReview project={project} onReview={()=>{}}/>);
 assert.match(html,/53 differences/);assert.match(html,/Review Voyage changes/);assert.match(html,/Nothing is resent or published/);
 assert.match(renderToStaticMarkup(<RemoteSaveReview project={project} busy onReview={()=>{}}/>),/disabled/);
 project.remote.operations[0].state='ACCEPTED';assert.equal(renderToStaticMarkup(<RemoteSaveReview project={project} onReview={()=>{}}/>),'');
});
test('export controls explain the two formats and their preservation guarantees',()=>{
 const html=renderToStaticMarkup(<WorldExportButtons onExport={()=>{}}/>);
 assert.match(html,/Export project JSON/);assert.match(html,/Export Voyage GameState/);assert.match(html,/Neither option rewrites IDs/);assert.match(html,/unapplied drafts/);
 assert.equal((renderToStaticMarkup(<WorldExportButtons disabled onExport={()=>{}}/>).match(/disabled/g)||[]).length,2);
});
