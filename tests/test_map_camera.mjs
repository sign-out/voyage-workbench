import assert from 'node:assert/strict';
import test from 'node:test';
import {zoomMapCamera, panMapCamera, MAP_MIN_CELL, MAP_MAX_CELL,mapLabelsVisible} from '../web/map-editor.js';

function world(camera, point, viewport){return {x:camera.x+(point.x-viewport.width/2)/camera.size,y:camera.y-(point.y-viewport.height/2)/camera.size};}
test('map labels default to visible and honor a hidden display preference without requiring storage',()=>{
 assert.equal(mapLabelsVisible(),true);
 for(const saved of [null,'shown','unknown'])assert.equal(mapLabelsVisible({getItem:key=>{assert.equal(key,'voyage-map-labels');return saved;}}),true);
 assert.equal(mapLabelsVisible({getItem:()=> 'hidden'}),false);
 assert.equal(mapLabelsVisible({getItem:()=>{throw new Error('Blocked storage');}}),true);
});
test('wheel zoom preserves the world coordinate under the pointer',()=>{
 const camera={x:24.6,y:-8.2,size:132},point={x:613,y:91},viewport={width:800,height:530};
 for(const size of [86,150,210]){
  const before=world(camera,point,viewport),after=world(zoomMapCamera(camera,size,point,viewport),point,viewport);
  assert.ok(Math.abs(before.x-after.x)<1e-12);assert.ok(Math.abs(before.y-after.y)<1e-12);
 }
});
test('zoom controls clamp and centered zoom does not translate the camera',()=>{
 const camera={x:8,y:-3,size:132},viewport={width:700,height:500},point={x:350,y:250};
 assert.deepEqual(zoomMapCamera(camera,Infinity,point,viewport),camera);
 assert.deepEqual(zoomMapCamera(camera,-100,point,viewport),{...camera,size:MAP_MIN_CELL});
 assert.deepEqual(zoomMapCamera(camera,10000,point,viewport),{...camera,size:MAP_MAX_CELL});
});
test('drag panning follows pointer pixels and preserves north-positive coordinates',()=>{
 assert.deepEqual(panMapCamera({x:4,y:5,size:100},150,-50),{x:2.5,y:4.5,size:100});
});
