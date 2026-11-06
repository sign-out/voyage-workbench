import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommunityReferenceHelp} from './CommunityReferenceHelp';
import {communityFixture} from '../../../tests/community-reference-fixture';
import {buildCommunityReferences} from '../../../packages/core/community-reference';
import {create} from '../../../packages/core/project';

test('cached help viewer exposes reference topics, provenance, pagination and honest boundaries',()=>{
 const refs=buildCommunityReferences(communityFixture(),1234).sections,project=create('world','World','{"heroesVersion":37}',1);
 const html=renderToStaticMarkup(<CommunityReferenceHelp references={refs} project={project} initialTopic="npcs" onRefresh={()=>{}}/>);
 for(const text of ['Community authoring help','Refresh community references &amp; help','Search help topics','Characters','Quests','World building','Measured limits &amp; runtime budgets','Voice tags','Starter GameState','Next help page','Snapshot','not official engine certification','not the JSON you are editing'])assert.ok(html.includes(text),text);
 assert.match(html,/Community character help/);assert.ok(!html.includes('Portraits and voice tags.'));
 const escaped=renderToStaticMarkup(<CommunityReferenceHelp references={refs} project={project} initialTopic="missing" onRefresh={()=>{}}/>);
 assert.match(escaped,/No cached section with this ID/);assert.ok(!escaped.includes('<script>'));
});

test('mismatched project help stays unavailable instead of falling back to another version',()=>{
 const refs=buildCommunityReferences(communityFixture(),1234).sections,project=create('world','Old world','{"heroesVersion":36}',1);
 const html=renderToStaticMarkup(<CommunityReferenceHelp references={refs} project={project} onRefresh={()=>{}}/>);
 assert.match(html,/No version-matched help is cached/);assert.match(html,/Nothing is sent to the third-party validator/);assert.ok(!html.includes('Community character help'));
 const browser=renderToStaticMarkup(<CommunityReferenceHelp references={refs} project={null} onRefresh={()=>{}}/>);
 assert.match(browser,/No project selected/);assert.match(browser,/Quests/);
});
