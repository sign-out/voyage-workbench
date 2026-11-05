import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompatibilityReview} from './CompatibilityReview';
import {create} from '../../../packages/core/project';

test('compatibility review explains scope, previews paths and disables blocked proposals',()=>{
 const render=(source:string)=>renderToStaticMarkup(<CompatibilityReview project={create('p','World',source,1)} command={async()=>{}} onReview={()=>{}}/>);
 const ready=render('{"heroesVersion":37,"npcs":{"a":{"known":true}}}');
 assert.match(ready,/initialKnown/);assert.match(ready,/not a version migration/);assert.doesNotMatch(ready,/<button disabled/);
 assert.match(render('{"heroesVersion":36}'),/<button disabled/);
 assert.match(render('{"heroesVersion":37,"npcs":{"a":{"known":true,"initialKnown":false}}}'),/collision/);
});
