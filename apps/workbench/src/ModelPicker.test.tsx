import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModelPicker} from './ModelPicker';
import {modelChoicesForProfile} from '../../../packages/core/model-catalog';
import {Providers} from './Providers';
test('model picker displays exact model options and keeps unavailable saved IDs',()=>{
 const html=renderToStaticMarkup(<ModelPicker label="planning model" value="saved-unlisted" models={[{id:'sol-fixture',name:'Sol'},{id:'luna-fixture',name:'Luna'}]} onChange={()=>{throw new Error('Rendering must not switch model');}}/>);
 assert.match(html,/Sol · sol-fixture/);assert.match(html,/Luna · luna-fixture/);assert.match(html,/Custom \/ saved model · saved-unlisted/);assert.match(html,/value="saved-unlisted"/);assert.match(html,/planning model selection/);
});
test('fallback choices are labelled as suggestions without replacing a saved model or default',()=>{
 const models=modelChoicesForProfile({id:'codex',name:'Codex',protocol:'codex',baseUrl:'',model:''});
 for(const value of ['','saved-unlisted','gpt-6.1-sol']){
  const html=renderToStaticMarkup(<ModelPicker label="planning model" value={value} models={models} onChange={()=>{throw new Error('Fallbacks must not switch models');}}/>);
  assert.match(html,/GPT-6.1-Sol · gpt-6.1-sol/);
  assert.match(html,/Author suggestions/);
  assert.match(html,/availability is not verified/);
  if(value==='')assert.match(html,/<option value="" selected="">Provider default/);
  else if(value==='saved-unlisted')assert.match(html,/Custom \/ saved model · saved-unlisted/);
  else assert.match(html,/<option value="gpt-6.1-sol" selected="">/);
 }
 const discovered=renderToStaticMarkup(<ModelPicker label="model" value="" models={[{id:'runtime-model',name:'Runtime model'}]} onChange={()=>{}}/>);
 assert.doesNotMatch(discovered,/Author suggestions/);
});
test('provider defaults and stage overrides are prepopulated before refreshing models',()=>{
 const html=renderToStaticMarkup(<Providers/>);
 assert.equal((html.match(/GPT-6.1-Sol · gpt-6.1-sol/g)||[]).length,4);
 assert.match(html,/Subscription default/);
 assert.match(html,/Use connection default/);
});
test('blank overrides continue to inherit connection defaults',()=>{
 const html=renderToStaticMarkup(<ModelPicker label="building model" value="" placeholder="Use connection default" models={[{id:'other',name:'Other',isDefault:true}]} onChange={()=>{throw new Error('Rendering must not switch model');}}/>);
 assert.match(html,/<option value="" selected="">Use connection default/);assert.doesNotMatch(html,/<option value="other" selected/);
});
