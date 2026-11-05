import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModelPicker} from './ModelPicker';
import {modelChoicesForProfile} from '../../../packages/core/model-catalog';
import {Providers} from './Providers';
import {StageModelPicker} from './StageModelPicker';
import type {Profile} from '../../../packages/core/providers';
test('model picker displays exact model options and keeps unavailable saved IDs',()=>{
 const html=renderToStaticMarkup(<ModelPicker label="planning model" value="saved-unlisted" models={[{id:'sol-fixture',name:'Sol'},{id:'luna-fixture',name:'Luna'}]} onChange={()=>{throw new Error('Rendering must not switch model');}}/>);
 assert.match(html,/Sol · sol-fixture/);assert.match(html,/Luna · luna-fixture/);assert.match(html,/Custom \/ saved model · saved-unlisted/);assert.match(html,/value="saved-unlisted"/);assert.match(html,/planning model selection/);
});
test('fallback choices are labelled as suggestions without replacing a saved model or default',()=>{
 const models=modelChoicesForProfile({id:'api',name:'API',protocol:'openai',baseUrl:'https://api.openai.com/v1',model:''});
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
test('Codex starts with CLI defaults and discovery guidance instead of guessed models',()=>{
 const html=renderToStaticMarkup(<Providers/>);
 assert.equal((html.match(/GPT-6.1-Sol · gpt-6.1-sol/g)||[]).length,0);
 assert.match(html,/Subscription default/);
 assert.match(html,/Codex CLI default/);assert.match(html,/no models are guessed/);
});
test('artwork selector distinguishes the CLI orchestrator from image engines and preserves overrides',()=>{
 const profile:Profile={id:'codex',name:'Codex',protocol:'codex',baseUrl:'',model:'vision'};
 const models=[{id:'vision',name:'Vision',isDefault:true,inputModalities:['text','image']},{id:'text-only',name:'Text only',inputModalities:['text']}];
 const render=(value:string)=>renderToStaticMarkup(<StageModelPicker stage="artwork" profile={profile} models={models} value={value} onChange={()=>{throw Error('Render cannot change routes');}}/>);
 const inherited=render('');assert.match(inherited,/Codex CLI orchestrator model/);assert.match(inherited,/image_gen.imagegen/);assert.match(inherited,/Use connection default · vision/);assert.doesNotMatch(inherited,/<option[^>]*value="text-only"/);
 const incompatible=render('text-only');assert.match(incompatible,/saved Codex model cannot read images/);assert.match(incompatible,/value="text-only"/);
 const unlisted=render('saved-pin');assert.match(unlisted,/Saved model saved-pin is not advertised/);assert.match(unlisted,/value="saved-pin"/);
 const failed=renderToStaticMarkup(<StageModelPicker stage="artwork" profile={profile} catalogError="Runtime offline" value="saved-pin" onChange={()=>{}}/>);assert.match(failed,/Runtime offline/);assert.match(failed,/Saved choices are unchanged/);
 const api=renderToStaticMarkup(<StageModelPicker stage="artwork" profile={{...profile,protocol:'openai',imageModel:'image-engine'}} models={models} value="" onChange={()=>{}}/>);assert.match(api,/Use connection default · image-engine/);assert.doesNotMatch(api,/image_gen.imagegen/);assert.doesNotMatch(api,/<option[^>]*value="vision"/);
});
test('blank overrides continue to inherit connection defaults',()=>{
 const html=renderToStaticMarkup(<ModelPicker label="building model" value="" placeholder="Use connection default" models={[{id:'other',name:'Other',isDefault:true}]} onChange={()=>{throw new Error('Rendering must not switch model');}}/>);
 assert.match(html,/<option value="" selected="">Use connection default/);assert.doesNotMatch(html,/<option value="other" selected/);
});
test('CLI notices are visible for explicitly selected and inherited model choices',()=>{
 const profile:Profile={id:'codex',name:'Codex',protocol:'codex',baseUrl:'',model:'vision'};
 const models=[{id:'vision',name:'Vision',inputModalities:['text','image'],availabilityNux:{message:'This model has an account-access notice.'}}];
 const explicit=renderToStaticMarkup(<StageModelPicker stage="artwork" profile={profile} models={models} value="vision" onChange={()=>{}}/>);
 const inherited=renderToStaticMarkup(<StageModelPicker stage="artwork" profile={profile} models={models} value="" onChange={()=>{}}/>);
 assert.match(explicit,/Provider notice: This model has an account-access notice/);
 assert.match(inherited,/Codex CLI notice: This model has an account-access notice/);
});
