import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {create,hash} from '../../../packages/core/project';
import {ArtworkWorkspace} from './ArtworkWorkspace';
import {ArtworkHistory} from './ArtworkHistory';
import {ArtworkProgress} from './ArtworkProgress';

test('artwork starts with named destinations for every authored image purpose',()=>{
 const project=create('artwork','World','{"npcs":{"guide":{"name":"Guide"}},"premadeCharacters":[{"name":"Hero"}],"regions":{"coast":{"name":"Coast"}},"locations":{"port":{"name":"Port","areas":{"dock":{"name":"Dock"}}}},"itemTypes":{"key":{"name":"Key"}}}',1);
 const html=renderToStaticMarkup(<ArtworkWorkspace project={project} apply={async()=>{throw new Error('Rendering must not edit');}} onCover={()=>{throw new Error('Rendering must not generate');}}/>);
 for(const text of ['World cover','NPC portraits','Playable characters','Region maps','Location scenes','Area scenes','Item images','Guide','Hero','Coast','Port','Dock','Key','Find artwork destination','Start with a destination'])assert.ok(html.includes(text),text);
 assert.match(html,/7 destinations/);
 assert.match(html,/remote saving is always separate/);
});
test('artwork gallery exposes bounded image review, original destinations and uncertain outcomes',()=>{
 const jobs=Array.from({length:8},(_,index)=>({id:String(index),created:1,destination:'Character '+index,destinationId:'destination-'+index,prompt:'Saved portrait brief',state:index===1?'uncertain':index===2?'generating':'generated',...(index===1?{error:'No automatic retry.'}:index===2?{}:{assetId:'image-'+index}),provider:'CLI fixture',model:'vision-fixture'}));
 const html=renderToStaticMarkup(<ArtworkHistory jobs={jobs} busy={false} onSelect={()=>{throw Error('Rendering must not attach');}} onRefresh={()=>{throw Error('Rendering must not fetch');}}/>);
 for(const text of ['Generated artwork gallery','Loading artwork for Character 0','Ready to review','Awaiting confirmed outcome','Outcome uncertain','No automatic retry','Select saved artwork for Character 0','Show more artwork (2 remaining)','CLI fixture','vision-fixture'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/artwork-history-card/g)||[]).length,6);
 assert.ok(!html.includes('Select saved artwork for Character 1'));
 assert.ok(!html.includes('Select saved artwork for Character 2'));
});
test('generation feedback names its purpose, target, provider and stage without inventing percentage completion',()=>{
 for(const phase of ['preparing','generating','saving'] as const){
  const html=renderToStaticMarkup(<ArtworkProgress activity={{destination:'Guide',purpose:'NPC portraits',started:Date.now(),phase,provider:'Codex CLI',model:'fixture-model'}}/>);
  for(const text of ['Artwork generation progress','Guide','NPC portraits','Codex CLI','fixture-model','Elapsed:','attachment are separate'])assert.ok(html.includes(text),text);
  assert.match(html,/<progress aria-label=/);
  assert.doesNotMatch(html,/<progress[^>]*value=/);
  assert.ok(html.includes(phase==='saving'?'Image received':phase==='generating'?'may take several minutes':'Checking the connection'));
 }
});
test('assistant artwork requests render an explicit review step, not an automatic generation',()=>{
 const project=create('artwork','World','{"npcs":{"guide":{"name":"Guide"}}}',1);
 project.artworkProposals=[{id:'proposal',taskId:'task',baseHash:hash(project.activeSource),destinationId:'["npcs","guide","portraitUrl"]',prompt:'A watercolor lighthouse keeper',label:'Guide',created:1}];
 const html=renderToStaticMarkup(<ArtworkWorkspace project={project} apply={async()=>{throw new Error('Rendering must not edit');}} onCover={()=>{throw new Error('Rendering must not generate');}}/>);
 for(const text of ['Assistant artwork requests','Review artwork requests','A watercolor lighthouse keeper','Review artwork brief','not generated images','attaching','Uploading'])assert.ok(html.includes(text),text);
});
