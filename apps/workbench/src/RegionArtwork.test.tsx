import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '../../../packages/core/project';
import {RegionImageAssignment} from './RegionImageAssignment';
import {RegionMapSlicer} from './RegionMapSlicer';
import {ImageFileImport} from './AssetLibrary';
const project=create('fixture','World','{"initialGameState":{"realms":{"Earth":{}},"regions":{"Coast":{"name":"Coast","realm":"Earth","x":0,"y":0}},"locations":{}}}',1);
test('region assignment starts with a destination and keeps advanced choices out of the first step',()=>{
 const html=renderToStaticMarkup(<RegionImageAssignment project={project} apply={async()=>{throw new Error('Rendering cannot change a world');}}/>);
 assert.match(html,/Artwork region/);assert.match(html,/1\. Choose a region/);assert.match(html,/Select a region to see its current artwork/);assert.match(html,/Coast/);
 assert.doesNotMatch(html,/Region assignment image|Apply image to region|Browse library or add file/);
 const sidebar=renderToStaticMarkup(<RegionImageAssignment sidebar project={project} apply={async()=>{}}/>);assert.match(sidebar,/region-image-sidebar/);assert.doesNotMatch(sidebar,/region-image-drop-list/);
});
test('master slicing explains north-up mapping, local-first crops and explicit uploads',()=>{
 const html=renderToStaticMarkup(<RegionMapSlicer project={project} apply={async()=>{throw new Error('Rendering cannot split, upload or assign');}}/>);
 assert.match(html,/Master map → region tiles/);assert.match(html,/Master map image/);assert.match(html,/West x/);assert.match(html,/North y/);assert.match(html,/Split into library tiles — no upload/);assert.match(html,/Create missing regions/);assert.match(html,/1–16/);assert.match(html,/rows go south/);
});
test('inline image import accepts supported formats and makes clear that it does not upload automatically',()=>{
 const html=renderToStaticMarkup(<ImageFileImport disabled={false} onImported={async()=>{}}/>);
 assert.match(html,/type="file"/);assert.match(html,/image\/png,image\/jpeg,image\/webp/);assert.match(html,/does not upload or attach it automatically/);
});
