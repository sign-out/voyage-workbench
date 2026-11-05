import test from 'node:test';
import assert from 'node:assert/strict';
import {modelCatalog,modelChoicesForProfile,modelChoicesForStage} from './model-catalog';
import type {Profile} from './providers';
test('catalog uses inference IDs, provider labels and deduplicates without guessing model availability',()=>{
 assert.deepEqual(modelCatalog([{id:'internal',model:'sol-fixture',displayName:'Sol',isDefault:true},{id:'luna-fixture',displayName:'Luna'},'luna-fixture',{id:'hidden',hidden:true},{name:'models/gemini-fixture'},null]),[{id:'sol-fixture',name:'Sol',isDefault:true},{id:'luna-fixture',name:'Luna'},{id:'gemini-fixture',name:'gemini-fixture'}]);
 assert.throws(()=>modelCatalog({data:[]}));
});
function profile(protocol:Profile['protocol'],baseUrl=''):Profile{return {id:'fixture',name:'Fixture',protocol,baseUrl,model:'saved-model'};}
test('fallback lists use the supplied exact IDs for API providers and Claude, not Codex CLI',()=>{
 const openai=['gpt-6.1-sol','gpt-6-astra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna'];
 const claude=['claude-opus-5-5','claude-sonnet-5-5','claude-fable-5-1','claude-fable-5','claude-opus-5','claude-opus-4-8','claude-opus-4-7','claude-opus-4-6','claude-opus-4-5','claude-sonnet-5','claude-sonnet-4-6','claude-haiku-5-5','claude-haiku-4-5'];
 const grok=['grok-4.7','grok-build','grok-4.6','grok-4.5'];
 for(const [connection,expected]of [
  [profile('codex'),[]],
  [profile('openai','https://api.openai.com/v1'),openai],
  [profile('openai-responses','https://api.openai.com/v1'),openai],
  [profile('anthropic','https://api.anthropic.com/v1'),claude],
  [profile('claude-code'),[...claude,'sonnet','opus','haiku']],
  [profile('openai','https://api.x.ai/v1'),grok]
 ] as [Profile,string[]][]){
  const before=JSON.stringify(connection),choices=modelChoicesForProfile(connection);
  assert.deepEqual(choices.map(model=>model.id),expected);
  assert.ok(choices.filter(model=>model.source==='fallback').every(model=>!model.isDefault));
  assert.equal(JSON.stringify(connection),before);
  assert.deepEqual(modelChoicesForProfile(connection,[]),choices);
 }
});
test('Codex preserves CLI modalities and filters artwork without altering saved choices',()=>{
 const connection=profile('codex'),before=JSON.stringify(connection);
 const catalog=modelCatalog([{id:'vision',inputModalities:['text','image'],isDefault:true},{id:'text-only',inputModalities:['text']},{id:'empty',inputModalities:[]},{id:'older-runtime'},{id:'invalid-modalities',inputModalities:[42,null,'text','image']}]);
 assert.deepEqual(catalog[0].inputModalities,['text','image']);
 assert.deepEqual(catalog[4].inputModalities,['text','image']);
 assert.deepEqual(modelChoicesForProfile(connection),[]);
 assert.deepEqual(modelChoicesForStage(connection,catalog,'artwork').map(model=>model.id),['vision','older-runtime','invalid-modalities']);
 assert.equal(modelChoicesForStage(connection,catalog,'planning').length,5);
 assert.equal(JSON.stringify(connection),before);
 assert.deepEqual(modelChoicesForStage(profile('openai'),catalog,'artwork'),[]);
});
test('CLI availability notices survive normalization without asserting model access',()=>{
 const catalog=modelCatalog([{id:'limited-model',inputModalities:['text','image'],availabilityNux:{message:'Extra account access may be required.'}}]);
 assert.equal(catalog[0].availabilityNux?.message,'Extra account access may be required.');
 assert.deepEqual(modelCatalog(catalog),catalog);
 assert.equal(modelCatalog([{id:'bounded',availabilityNux:{message:'x'.repeat(2000)}}])[0].availabilityNux?.message.length,1000);
});
test('nonempty live catalogs take precedence and Claude aliases do not erase exact fallbacks',()=>{
 const discovered=[{id:'account-model',name:'Available model',isDefault:true}];
 for(const connection of [profile('codex'),profile('anthropic'),profile('claude-code'),profile('openai','https://api.x.ai/v1')])assert.strictEqual(modelChoicesForProfile(connection,discovered),discovered);
 const aliases=[{id:'opus',name:'Runtime Opus alias'}],choices=modelChoicesForProfile(profile('claude-code'),aliases);
 assert.ok(choices.some(model=>model.id==='claude-opus-5-5'&&model.source==='fallback'));
 assert.deepEqual(choices.filter(model=>!model.source),aliases);
 assert.equal(new Set(choices.map(model=>model.id)).size,choices.length);
});
test('fallbacks do not assign OpenAI or Grok models to unrelated compatible endpoints or harnesses',()=>{
 for(const connection of [profile('openai','http://localhost:1234/v1'),profile('openai','https://openrouter.ai/api/v1'),profile('openai','https://api.x.ai.example.com/v1'),profile('openai-responses','https://custom.example/v1'),profile('openai','invalid URL'),profile('cursor'),profile('opencode'),profile('gemini')])assert.deepEqual(modelChoicesForProfile(connection),[]);
});
