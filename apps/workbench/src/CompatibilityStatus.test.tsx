import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompatibilityStatus,ReleaseGuidance} from './CompatibilityStatus';
import {create,hash} from '../../../packages/core/project';

test('status exposes local persistence, authored revision and unknown engine without claiming compatibility',()=>{
 const project=create('p','World','{"heroesVersion":37,"compatibilityRevision":9}',1);
 project.remote={environment:'alpha',worldId:'WORLD',baselineHash:hash(project.activeSource),etag:'revision',operations:[]};
 const html=renderToStaticMarkup(<CompatibilityStatus project={project} connection={{environment:'production'}}/>);
 assert.match(html,/matches last checked Voyage draft/);assert.match(html,/Compatibility revision/);assert.match(html,/>9</);assert.match(html,/Engine build/);assert.match(html,/Unknown/);assert.match(html,/project remains linked to alpha/);assert.match(html,/1280 × 720/);
 const dirty=renderToStaticMarkup(<CompatibilityStatus project={project} dirty/>);assert.match(dirty,/Unsaved changes/);
});
test('production guidance never applies alpha publication limits',()=>{
 const project=create('p','World','{}',1);project.remote.worldId='WORLD';project.remote.environment='production';
 const html=renderToStaticMarkup(<ReleaseGuidance project={project}/>);assert.match(html,/No release-specific publish caps/);assert.doesNotMatch(html,/350,000/);assert.match(html,/passing art grade does not override/);
});
test('alpha guidance names provisional release limits and oversized media without truncation',()=>{
 const source=JSON.stringify({itemTypes:{book:{mediaContent:'x'.repeat(4001)}}}),project=create('p','World',source,1);project.remote.worldId='WORLD';project.remote.environment='alpha';
 const html=renderToStaticMarkup(<ReleaseGuidance project={project}/>);assert.match(html,/350,000/);assert.match(html,/4,000/);assert.match(html,/4001/);assert.match(html,/upstream counting is unverified/);assert.equal(project.activeSource,source);
});
