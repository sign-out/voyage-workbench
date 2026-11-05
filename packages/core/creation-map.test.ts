import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCreationMaps,mapBlueprintIssues,mapRegion,creationMapSvg} from './creation-map';
import {updateCreation} from './world-creation';
import {hash} from './project';
import {source,blueprint,workspace} from '../../tests/creation-fixture';

test('blueprint placement agrees with region-local coordinates and north-up map geometry',()=>{
 assert.deepEqual(mapBlueprintIssues(source,[blueprint]),[]);assert.deepEqual(mapRegion(source,[blueprint],'region'),{map:blueprint,column:0,row:0});
 const shifted=structuredClone(blueprint);shifted.features[2].points=[[.8,.5]];assert.ok(mapBlueprintIssues(source,[shifted]).some(issue=>issue.includes('placement disagrees')));
 assert.ok(mapBlueprintIssues(source,[]).some(issue=>issue.includes('no map blueprint')));
 assert.ok(mapBlueprintIssues(source,[blueprint,blueprint]).some(issue=>issue.includes('overlapping')));
});
test('map inputs reject scripts, invalid coordinates, palettes, duplicate IDs and degenerate features',()=>{
 const invalid=[{...blueprint,water:'url(https://evil)'},{...blueprint,columns:100},{...blueprint,features:[{id:'bad',kind:'land',points:[[0,0],[1,0]]}]},{...blueprint,features:[{id:'bad',kind:'river',points:[[0,0],[NaN,1]]}]},{...blueprint,features:[...blueprint.features,blueprint.features[0]]}];
 for(const map of invalid)assert.throws(()=>validateCreationMaps([map]));assert.throws(()=>validateCreationMaps([blueprint,blueprint]));
});
test('map rendering is deterministic, label-free by default and escapes opt-in labels',()=>{
 const map=structuredClone(blueprint);map.features[2].label='<script>&"';const svg=creationMapSvg(map);assert.equal(svg,creationMapSvg(map));assert.doesNotMatch(svg,/<text|<script|https:/);assert.match(svg,/viewBox="0 0 1 1"/);assert.match(svg,/id="river"/);
 assert.match(creationMapSvg(map,undefined,true),/&lt;script&gt;&amp;&quot;/);assert.throws(()=>creationMapSvg(map,{column:-1,row:0,columns:1,rows:1}));
});
test('region render patches use one global blueprint so geometry is continuous at boundaries',()=>{
 const map={...blueprint,columns:2,features:[...blueprint.features,{id:'crossing-road',kind:'road' as const,points:[[.2,.5],[1.8,.5]]}]};
 const left=creationMapSvg(map,{column:0,row:0,columns:1,rows:1}),right=creationMapSvg(map,{column:1,row:0,columns:1,rows:1});assert.match(left,/0.2,0.5 1.8,0.5/);assert.match(right,/0.2,0.5 1.8,0.5/);assert.match(right,/viewBox="1 0 1 1"/);
});
test('locked scene features preserve both their geometry and coordinate frame',()=>{
 const result=workspace();result.maps[0].features[2].locked=true;const maps=structuredClone(result.maps);maps[0].features[2].points=[[.6,.5]];assert.throws(()=>updateCreation(result,'maps',JSON.stringify(maps),source,hash,1),/locked/);
 const frame=structuredClone(result.maps);frame[0].west=1;assert.throws(()=>updateCreation(result,'maps',JSON.stringify(frame),source,hash,1),/locked/);
});
test('atlas styling adds globally anchored terrain texture, road casing and relief without remote resources',()=>{
 const map=structuredClone(blueprint);map.features.push({id:'woods',kind:'forest',points:[[.1,.1],[.3,.1],[.3,.3]]},{id:'peaks',kind:'mountain',points:[[.2,.2]]},{id:'trail',kind:'road',points:[[0,.4],[1,.4]]});
 const atlas=creationMapSvg(map),schematic=creationMapSvg({...map,style:'schematic'});
 assert.match(atlas,/patternUnits="userSpaceOnUse"/);assert.match(atlas,/stroke-dasharray/);assert.match(atlas,/fill-opacity=".23"/);assert.doesNotMatch(atlas,/<image|<script|<filter|https:|href=/);
 assert.doesNotMatch(schematic,/<pattern|stroke-dasharray/);assert.ok(atlas.length>schematic.length);assert.throws(()=>validateCreationMaps([{...map,style:'external-renderer'}]),/styling/);
});
