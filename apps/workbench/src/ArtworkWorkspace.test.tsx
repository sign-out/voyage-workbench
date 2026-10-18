import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {create,hash} from '../../../packages/core/project';
import {ArtworkWorkspace} from './ArtworkWorkspace';

test('artwork starts with named destinations for every authored image purpose',()=>{
 const project=create('artwork','World','{"npcs":{"guide":{"name":"Guide"}},"premadeCharacters":[{"name":"Hero"}],"regions":{"coast":{"name":"Coast"}},"locations":{"port":{"name":"Port","areas":{"dock":{"name":"Dock"}}}},"itemTypes":{"key":{"name":"Key"}}}',1);
 const html=renderToStaticMarkup(<ArtworkWorkspace project={project} apply={async()=>{throw new Error('Rendering must not edit');}} onCover={()=>{throw new Error('Rendering must not generate');}}/>);
 for(const text of ['World cover','NPC portraits','Playable characters','Region maps','Location scenes','Area scenes','Item images','Guide','Hero','Coast','Port','Dock','Key','Find artwork destination','Start with a destination'])assert.ok(html.includes(text),text);
 assert.match(html,/7 destinations/);
 assert.match(html,/remote saving is always separate/);
});
test('assistant artwork requests render an explicit review step, not an automatic generation',()=>{
 const project=create('artwork','World','{"npcs":{"guide":{"name":"Guide"}}}',1);
 project.artworkProposals=[{id:'proposal',taskId:'task',baseHash:hash(project.activeSource),destinationId:'["npcs","guide","portraitUrl"]',prompt:'A watercolor lighthouse keeper',label:'Guide',created:1}];
 const html=renderToStaticMarkup(<ArtworkWorkspace project={project} apply={async()=>{throw new Error('Rendering must not edit');}} onCover={()=>{throw new Error('Rendering must not generate');}}/>);
 for(const text of ['Assistant artwork requests','Review artwork requests','A watercolor lighthouse keeper','Review artwork brief','not generated images','attaching','Uploading'])assert.ok(html.includes(text),text);
});
