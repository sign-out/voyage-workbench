import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentActivity} from './AgentActivity';
import {create,reduce} from '../../../packages/core/project';

test('execution evidence renders escaped tool output and clearly limits validation claims',()=>{
 let project=create('p','Evidence','{"value":"<script>alert(1)</script>"}',1);
 project=reduce(project,{type:'prepareTask',kind:'plan',id:'t',attempt:'a',prompt:'Read'});project=reduce(project,{type:'taskRunning',taskId:'t',attempt:'a'});
 project=reduce(project,{type:'taskTool',taskId:'t',attempt:'a',callId:'read',name:'world_read',args:{path:['value']}});
 const html=renderToStaticMarkup(<AgentActivity task={project.tasks[0]}/>);assert.match(html,/world_read/);assert.match(html,/not official Voyage validation/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

test('legacy tasks without evidence render no misleading pass and old summaries explain retention',()=>{
 const project=create('p','Empty','{}',1);let staged=reduce(project,{type:'prepareTask',kind:'plan',id:'t',attempt:'a',prompt:'Inspect'});
 assert.equal(renderToStaticMarkup(<AgentActivity task={staged.tasks[0]}/>),'');staged.tasks[0].toolSummary={calls:2,rejected:1};
 assert.match(renderToStaticMarkup(<AgentActivity task={staged.tasks[0]}/>),/retention policy/);
});

test('recovery permissions and blocked reasons remain visible even before tools run',()=>{
 let project=create('p','Recovery','{"value":1}',1);
 project=reduce(project,{type:'workOrder',order:{objective:'Inspect value',requirements:[],allowedPaths:[['value']]}});
 project=reduce(project,{type:'prepareTask',kind:'work',id:'t',attempt:'a',prompt:'Inspect',autoResume:true,hostPlatform:'desktop',route:{protocol:'openai'}});
 project=reduce(project,{type:'recover'});project=reduce(project,{type:'taskRecoveryBlocked',taskId:'t',reason:'<script>Changed source</script>'});
 const html=renderToStaticMarkup(<AgentActivity task={project.tasks[0]}/>);
 assert.match(html,/Approved permissions/);assert.match(html,/Checkpoint continuation paused/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
