import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalEditingSettings,LocalTaskOutcome} from './LocalEditingSettings';
import type {Task} from '../../../packages/core/project';
test('local editing settings expose automatic default and proposal-only alternative',()=>{
 const html=renderToStaticMarkup(<LocalEditingSettings/>);assert.match(html,/Local assistant edit mode/);assert.match(html,/selected="">Apply locally automatically/);assert.match(html,/proposal-only/);assert.match(html,/provider charges/);
});
test('local task feedback distinguishes applied changes from blocked proposals',()=>{
 const applied=renderToStaticMarkup(<LocalTaskOutcome task={{state:'APPLIED'} as Task} onHistory={()=>{}} onReview={()=>{}}/>);assert.match(applied,/applied locally/);assert.match(applied,/View local history/);assert.match(applied,/Nothing was uploaded/);
 const blocked=renderToStaticMarkup(<LocalTaskOutcome task={{state:'PROPOSAL_READY',localApplyBlockedReason:'Draft exists'} as Task} onHistory={()=>{}} onReview={()=>{}}/>);assert.match(blocked,/Draft exists/);assert.match(blocked,/Review local proposal/);
});
