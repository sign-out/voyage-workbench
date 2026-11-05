import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentRunOptions} from './AgentRunOptions';

test('orchestration permissions default unchecked and explain charges and checkpoint semantics',()=>{
 const html=renderToStaticMarkup(<AgentRunOptions value={{autoResume:false,allowDelegation:false}} onChange={()=>{}} capabilities={{checkpointResume:true,delegation:true}}/>);
 assert.doesNotMatch(html,/checked=""/);assert.match(html,/may incur charges/);assert.match(html,/fresh session/);assert.match(html,/reset after starting/);
 assert.match(html,/Allow read-only delegated reviews/);assert.match(html,/Allow automatic checkpoint continuation/);
});

test('unavailable capabilities are disabled rather than silently falling back',()=>{
 const html=renderToStaticMarkup(<AgentRunOptions value={{autoResume:false,allowDelegation:false}} onChange={()=>{}} capabilities={{checkpointResume:false,delegation:false}}/>);
 assert.equal((html.match(/disabled=""/g)||[]).length,2);assert.match(html,/unavailable on this host/);assert.match(html,/No provider fallback/);
});
