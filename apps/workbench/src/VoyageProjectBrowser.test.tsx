import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProjectSources,voyageProjectEntries} from './VoyageProjectBrowser';

test('project picker exposes local projects, Voyage worlds and Voyage mods',()=>{
 for(const value of ['local','world','mod'] as const){
  const markup=renderToStaticMarkup(<ProjectSources value={value} onChange={()=>{}}/>);
  for(const name of ['Local projects','Voyage worlds','Voyage mods'])assert.ok(markup.includes(name));
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1);
 }
 const disabled=renderToStaticMarkup(<ProjectSources value="mod" busy onChange={()=>{}}/>);
 assert.equal((disabled.match(/disabled=""/g)||[]).length,3);
});

test('Voyage project lists accept wrapped or unwrapped pages and deduplicate IDs',()=>{
 const worlds=[{shortId:'first',title:'World'},{shortId:'mod',title:'Mod',isMod:true},{shortId:'first',title:'Updated'},{title:'No ID'},null];
 assert.deepEqual(voyageProjectEntries({data:{worlds}}),voyageProjectEntries({worlds}));
 assert.deepEqual(voyageProjectEntries({worlds}).map(entry=>[entry.shortId,entry.title]),[['first','Updated'],['mod','Mod']]);
 assert.deepEqual(voyageProjectEntries({data:{worlds:[]}}),[]);
 assert.throws(()=>voyageProjectEntries({data:{error:'Unavailable'}}),/unreadable project list/);
});
