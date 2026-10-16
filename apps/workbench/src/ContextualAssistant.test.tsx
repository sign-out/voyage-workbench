import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ContextualAssistant} from './ContextualAssistant';
import {create} from '../../../packages/core/project';
test('assistant is available without leaving the current editor and uses an accessible toggle',()=>{
 const html=renderToStaticMarkup(<ContextualAssistant project={create('p','World','{}',1)} focus={{screen:'characters',label:'NPCs'}} includeBuilderNotes onReceive={()=>{}} onReview={()=>{}}/>);
 assert.match(html,/Contextual world assistant/);assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls="contextual-assistant-panel"/);assert.match(html,/>Assistant</);
});
