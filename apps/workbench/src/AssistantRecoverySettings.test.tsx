import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AssistantRecoverySettings} from './AssistantRecoverySettings';

test('assistant recovery defaults on with a bounded editable attempt count',()=>{
 const html=renderToStaticMarkup(<AssistantRecoverySettings/>);
 assert.match(html,/Automatically resolve assistant errors[^>]*checked=""/);
 assert.match(html,/aria-label="Maximum recovery attempts"[^>]*min="1"[^>]*max="10"[^>]*value="3"/);
 assert.match(html,/after the initial failure/);
 assert.match(html,/across the whole task/);
 assert.match(html,/newly started tasks on this device/);
});

test('assistant recovery settings disclose charges and preserve remote safety boundaries',()=>{
 const html=renderToStaticMarkup(<AssistantRecoverySettings/>);
 assert.match(html,/may use provider credits/);
 assert.match(html,/does not bypass approvals/);
 assert.match(html,/retry failed provider connections/);
 assert.match(html,/automatically replay Voyage saves/);
 assert.match(html,/Unknown remote outcomes still require reconciliation/);
});
