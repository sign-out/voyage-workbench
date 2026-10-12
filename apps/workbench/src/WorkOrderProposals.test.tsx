import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,hash} from '../../../packages/core/project';
import {WorkOrderProposals} from './WorkOrderProposals';
test('suggestion UI distinguishes current and stale orders and exposes no run action',()=>{
 const project=create('p','World','{"name":"World"}',1);
 project.workOrderProposals=[{id:'suggestion',taskId:'task',baseHash:hash(project.activeSource),created:1,order:{objective:'<Improve>',requirements:['Preserve unknowns'],allowedPaths:[['name']]}}];
 const render=()=>renderToStaticMarkup(<WorkOrderProposals project={project} busy={false} onLoad={()=>{}} onDismiss={()=>{}}/>);
 const current=render();assert.match(current,/&lt;Improve&gt;/);assert.match(current,/Load into Work Order/);assert.doesNotMatch(current,/disabled=""/);assert.doesNotMatch(current,/Approve &amp; run/);
 project.activeSource='{"name":"Changed"}';const stale=render();assert.match(stale,/world changed/i);assert.match(stale,/disabled=""/);
});
