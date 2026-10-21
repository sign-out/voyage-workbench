import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalEditingSettings,LocalTaskOutcome} from './LocalEditingSettings';
import type {Task} from '../../../packages/core/project';
test('local editing settings expose automatic default and proposal-only alternative',()=>{
 const html=renderToStaticMarkup(<LocalEditingSettings/>);assert.match(html,/Local assistant edit mode/);assert.match(html,/selected="">Apply locally automatically/);assert.match(html,/proposal-only/);assert.match(html,/provider charges/);assert.match(html,/local validation errors keep the result as a proposal/);
});
test('validation-blocked work retains an accessible review action instead of claiming local apply',()=>{
 const html=renderToStaticMarkup(<LocalTaskOutcome task={{kind:'work',state:'PROPOSAL_READY',localApplyBlockedReason:'Local validation found errors. Review the proposal.'} as Task} onHistory={()=>{}} onReview={()=>{}}/>);
 assert.match(html,/Automatic local apply paused/);assert.match(html,/Local validation found errors/);assert.match(html,/Review local proposal/);assert.doesNotMatch(html,/Assistant changes applied locally/);
});
test('local task feedback distinguishes applied changes from blocked proposals',()=>{
 const applied=renderToStaticMarkup(<LocalTaskOutcome task={{state:'APPLIED'} as Task} onHistory={()=>{}} onReview={()=>{}}/>);assert.match(applied,/applied locally/);assert.match(applied,/View local history/);assert.match(applied,/Nothing was uploaded/);
 const blocked=renderToStaticMarkup(<LocalTaskOutcome task={{state:'PROPOSAL_READY',localApplyBlockedReason:'Draft exists'} as Task} onHistory={()=>{}} onReview={()=>{}}/>);assert.match(blocked,/Draft exists/);assert.match(blocked,/Review local proposal/);
});
