import assert from 'node:assert/strict';
import test from 'node:test';
import {regionTilePlan,assignRegionTiles,validateMasterSize} from './region-artwork';
import {read,insert} from './document';
const source='{"initialGameState":{"realms":{"Earth":{},"Other":{}},"regions":{"west":{"realm":"Earth","x":-1,"y":2,"images":{"map":{"imageUrl":"https://example.com/old.png","extra":1},"other":{"keep":true}}},"east":{"realm":"Earth","x":0,"y":2},"south":{"realm":"Earth","x":-1,"y":1},"elsewhere":{"realm":"Other","x":0,"y":1}},"locations":{"home":{"region":"west","x":3,"y":4}},"precise":9007199254740993}}';
test('master tiles map west to east and north to south in one realm, retaining empty cells',()=>{
 const plan=regionTilePlan(source,'Earth',-1,2,2,2);
 assert.deepEqual(plan.map(tile=>[tile.column,tile.row,tile.x,tile.y,tile.regionKey]),[[0,0,-1,2,'west'],[1,0,0,2,'east'],[0,1,-1,1,'south'],[1,1,0,1,undefined]]);
});
test('mapping rejects ambiguous regions and invalid grids before any crop or upload',()=>{
 for(const values of [[0,1],[17,1],[2,1.5]])assert.throws(()=>regionTilePlan(source,'Earth',0,0,...values as [number,number]));
 assert.throws(()=>regionTilePlan(source,'missing',0,0,1,1));
 assert.throws(()=>regionTilePlan(source,'Earth',Number.MAX_SAFE_INTEGER,0,2,1));
 const overlap=source.replace('"elsewhere":{"realm":"Other","x":0,"y":1}', '"elsewhere":{"realm":"Earth","x":-1,"y":2}');
 assert.throws(()=>regionTilePlan(overlap,'Earth',-1,2,2,2),/overlap/);
});
test('12 by 12 creates every missing region while preserving existing world data',()=>{
 const plan=regionTilePlan(source,'Earth',-1,2,12,12,{createMissing:true});
 assert.equal(plan.length,144);assert.equal(plan.filter(tile=>tile.createRegion).length,141);
 const assigned=assignRegionTiles(source,plan.map(tile=>({...tile,regionKey:tile.regionKey!,realm:'Earth',url:`https://example.com/${tile.column}-${tile.row}.png`})));
 const regions=JSON.parse(read(assigned,['initialGameState','regions'])!);
 assert.equal(Object.keys(regions).length,145);
 for(const tile of plan){const region=regions[tile.regionKey!];assert.equal(region.x,tile.x);assert.equal(region.y,tile.y);assert.equal(region.realm,'Earth');assert.equal(region.images.map.imageUrl,`https://example.com/${tile.column}-${tile.row}.png`);}
 assert.equal(read(assigned,['initialGameState','precise']),'9007199254740993');
 assert.equal(read(assigned,['initialGameState','locations']),read(source,['initialGameState','locations']));
 assert.equal(read(assigned,['initialGameState','regions','west','images','map','extra']),'1');
});
test('new region keys avoid collisions in other realms and reject stale occupied cells',()=>{
 const blank='{"initialGameState":{"realms":{"Earth":{},"Other":{}}}}';
 const created=assignRegionTiles(blank,[{regionKey:'Earth · Region (0, 0)',realm:'Other',x:5,y:5,createRegion:true,url:'https://example.com/other.png'}]);
 const plan=regionTilePlan(created,'Earth',0,0,1,1,{createMissing:true});
 assert.equal(plan[0].regionKey,'Earth · Region (0, 0) · 2');
 const malformed=insert(created,['initialGameState','regions'],'Earth · Region (0, 0) · 2','null');
 assert.equal(regionTilePlan(malformed,'Earth',0,0,1,1,{createMissing:true})[0].regionKey,'Earth · Region (0, 0) · 3');
 assert.doesNotThrow(()=>assignRegionTiles(created,plan.map(tile=>({...tile,regionKey:tile.regionKey!,realm:'Earth',url:'https://example.com/new.png'}))));
 assert.throws(()=>assignRegionTiles(source,[{regionKey:'new',realm:'Earth',x:-1,y:2,createRegion:true,url:'https://example.com/new.png'}]),/already contains/);
 assert.throws(()=>assignRegionTiles(source,[{regionKey:'new',createRegion:true,url:'https://example.com/new.png'}]));
});
test('masters must provide at least 600 pixels on both axes of every tile, without upscaling',()=>{
 assert.doesNotThrow(()=>validateMasterSize(7200,7200,12,12));
 assert.doesNotThrow(()=>validateMasterSize(7211,7211,12,12));
 assert.doesNotThrow(()=>validateMasterSize(7200,1800,12,3));
 for(const [width,height]of [[7199,7200],[7200,7199],[10000,5000],[NaN,7200]])assert.throws(()=>validateMasterSize(width,height,12,12),/at least 7200 × 7200/);
 assert.throws(()=>validateMasterSize(10000,10000,17,1),/1–16/);
});
test('bulk assignment changes only map URLs, preserves precision and metadata, and rejects invalid or duplicate targets',()=>{
 const assigned=assignRegionTiles(source,[{regionKey:'west',url:'https://example.com/west.png'},{regionKey:'east',url:'https://example.com/east.png'}]);
 assert.equal(read(assigned,['initialGameState','regions','west','images','map','extra']),'1');
 assert.equal(read(assigned,['initialGameState','regions','west','images','other','keep']),'true');
 assert.equal(read(assigned,['initialGameState','precise']),'9007199254740993');
 assert.equal(read(assigned,['initialGameState','locations']),read(source,['initialGameState','locations']));
 assert.equal(read(assigned,['initialGameState','regions','east','images','map','imageUrl']),'"https://example.com/east.png"');
 assert.throws(()=>assignRegionTiles(source,[{regionKey:'missing',url:'https://example.com/map.png'}]));
 assert.throws(()=>assignRegionTiles(source,[{regionKey:'west',url:'data:image/png;base64,aaa'}]));
 assert.throws(()=>assignRegionTiles(source,[{regionKey:'west',url:'https://example.com/a.png'},{regionKey:'west',url:'https://example.com/b.png'}]));
});
