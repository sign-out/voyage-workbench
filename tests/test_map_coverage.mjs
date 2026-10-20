import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeMapCoverage,coverageScale,COVERAGE_METRICS} from '../web/map-coverage.js';

function fixture(){
 const state={realms:{Earth:{}},regions:{Coast:{realm:'Earth',x:0,y:0,basicInfo:'A quiet coast',factions:['Guild','Guild']},Hills:{realm:'Earth',x:1,y:0,basicInfo:''}},
  locations:{Dock:{region:'Coast',x:-20,y:10,basicInfo:'A busy dock',factions:['Guild'],areas:{Pier:{description:'Wooden old pier'}}},Inn:{region:'Coast',x:20,y:0,basicInfo:''},Cave:{region:'Hills',x:0,y:0}},
  npcs:{Mira:{currentLocation:'Dock',faction:'Guild',basicInfo:'A patient sailor'},Lost:{currentLocation:'Missing',basicInfo:'No known home'}},
  factions:{Guild:{basicInfo:'The harbor guild'},Wanderers:{basicInfo:'No home'}},
  quests:{Delivery:{questLocation:'Dock',questStatement:'Deliver the parcel'}},
  storyStarts:{Arrival:{locations:['Dock','Dock','Inn'],description:'Arrive by boat'}},
  worldLore:{Tides:{text:'Tides change each day',locations:['Dock','Inn'],region:'Coast'},History:{text:'The world was born'}},
  items:{Pearl:{locations:['Dock','Cave'],description:'A silver pearl'}},events:{Festival:{region:'Coast',description:'A spring feast'}},
 };
 return {state,map:projection(state)};
}
function projection(state){return {regionSize:100,realms:Object.keys(state.realms).map(key=>({key})),regions:Object.entries(state.regions).map(([key,value])=>({key,...value})),locations:Object.entries(state.locations).map(([key,value])=>({key,...value}))};}
const id=(section,key)=>JSON.stringify([section,key]);

test('explicit NPC, quest, story-start, area, and extra content links aggregate into map buckets',()=>{
 const {state,map}=fixture(),analysis=analyzeMapCoverage(state,map),coast=analysis.regions.get('Coast').counts,dock=analysis.locations.get('Dock').counts;
 assert.equal(coast.locations,2);assert.equal(coast.npcs,1);assert.equal(coast.quests,1);assert.equal(coast.storyStarts,1);assert.equal(coast.areas,1);assert.equal(coast.other,2);
 assert.equal(dock.npcs,1);assert.equal(dock.quests,1);assert.equal(dock.storyStarts,1);assert.equal(dock.areas,1);assert.equal(dock.other,1);
 assert.equal(analysis.regions.get('Hills').counts.other,1);assert.ok(analysis.issues.some(issue=>issue.label.includes('Missing')));
});
test('faction presence and records with repeated links count once at each spatial level',()=>{
 const {state,map}=fixture(),analysis=analyzeMapCoverage(state,map);
 assert.equal(analysis.regions.get('Coast').counts.factions,1);assert.equal(analysis.locations.get('Dock').counts.factions,1);
 assert.equal(analysis.regions.get('Coast').records.filter(record=>record===id('storyStarts','Arrival')).length,1);
 assert.equal(analysis.regions.get('Coast').counts.words,31);
 assert.equal(analysis.locations.get('Dock').counts.words,25);
});
test('word counts exclude names, image URLs, settings, and unlinked world prose',()=>{
 const {state,map}=fixture();state.npcs.Mira.name='A very very very long name';state.npcs.Mira.portraitUrl='https://example.test/a/long/url';state.npcs.Mira.instructions='Do not count these words';
 const analysis=analyzeMapCoverage(state,map);
 assert.equal(analysis.records.get(id('npcs','Mira')).words,3);
 assert.equal(analysis.records.get(id('worldLore','History')).words,4);
 assert.ok(analysis.unmapped.includes(id('worldLore','History')));
 assert.equal(analysis.regions.get('Coast').counts.unfinished,1);
});
test('region-only records and invalid local coordinates never create placed hotspots',()=>{
 const {state}=fixture();state.locations.Dock.x=80;state.locations.Inn.y=null;
 const analysis=analyzeMapCoverage(state,projection(state));
 assert.equal(analysis.placedLocation('Dock'),false);assert.equal(analysis.placedLocation('Inn'),false);
 assert.equal(analysis.regions.get('Coast').counts.npcs,1);
 assert.ok(analysis.regionOnly.includes(id('npcs','Mira')));assert.ok(analysis.regionOnly.includes(id('events','Festival')));
 assert.ok(!analysis.unmapped.includes(id('npcs','Mira')));
});
test('unplaced parents make their content unmapped and unsupported prose never places it',()=>{
 const {state}=fixture();state.regions.Coast.realm='Absent';state.npcs.Lost.basicInfo='Lives in Dock in Coast';
 const analysis=analyzeMapCoverage(state,projection(state));
 assert.equal(analysis.placedRegion('Coast'),false);assert.equal(analysis.placedLocation('Dock'),false);
 assert.ok(analysis.unmapped.includes(id('npcs','Mira')));assert.ok(analysis.unmapped.includes(id('npcs','Lost')));
 assert.equal(analysis.records.get(id('npcs','Lost')).locations.size,0);
});
test('spatial links are deduplicated and broken faction and region references are reported',()=>{
 const {state}=fixture();state.locations.Inn.factions=['Unknown','Unknown'];state.events.Festival.regions=['Coast','Missing'];
 const analysis=analyzeMapCoverage(state,projection(state));
 assert.equal(analysis.records.get(id('storyStarts','Arrival')).links.size,2);
 assert.ok(analysis.issues.some(issue=>issue.label.includes('unknown faction')));assert.ok(analysis.issues.some(issue=>issue.label.includes('unknown region')));
 assert.equal(analysis.locations.get('Dock').counts.connections,7);
});
test('special record keys are safe and analysis does not mutate authored data',()=>{
 const state=JSON.parse('{"realms":{"constructor":{}},"regions":{"__proto__":{"realm":"constructor","x":0,"y":0}},"locations":{"constructor":{"region":"__proto__","x":0,"y":0}},"npcs":{"__proto__":{"currentLocation":"constructor"}}}');
 const before=JSON.stringify(state),analysis=analyzeMapCoverage(state,projection(state));
 assert.equal(analysis.regions.get('__proto__').counts.npcs,1);assert.equal(analysis.locations.get('constructor').counts.npcs,1);assert.equal(JSON.stringify(state),before);
});
test('malformed optional collections are ignored and empty layers are absent',()=>{
 const state={realms:{},regions:{},locations:{},npcs:[],quests:null,worldLore:{Bad:null},items:{Bad:4}};
 const analysis=analyzeMapCoverage(state,projection(state));assert.deepEqual(analysis.available,[]);assert.equal(analysis.records.size,0);
});
test('item types and narrative events stay visible when unplaced and accept explicit place links',()=>{
 const {state,map}=fixture();state.itemTypes={Compass:{description:'A brass compass'}};state.narrativeEvents={Storm:{beats:'Dark clouds gather',region:'Hills'}};
 const analysis=analyzeMapCoverage(state,map);
 assert.ok(analysis.unmapped.includes(id('itemTypes','Compass')));
 assert.equal(analysis.regions.get('Hills').counts.other,2);
 assert.equal(analysis.records.get(id('narrativeEvents','Storm')).words,3);
});
test('scales use the supplied scope and normalize combined weights by metric',()=>{
 const counts=values=>({counts:Object.fromEntries(COVERAGE_METRICS.map(metric=>[metric.id,values[metric.id]||0]))});
 const busy=counts({npcs:10,words:1000}),quiet=counts({npcs:5,words:100}),metrics=COVERAGE_METRICS.filter(metric=>['npcs','words'].includes(metric.id));
 const raw=coverageScale([busy,quiet],'npcs',{},metrics);assert.equal(raw.max,10);assert.equal(raw.intensity(quiet),.5);
 const combined=coverageScale([busy,quiet],'combined',{npcs:2,words:0},metrics);assert.equal(combined.value(busy),1);assert.equal(combined.value(quiet),.5);
 assert.equal(coverageScale([quiet],'npcs',{},metrics).intensity(quiet),1);
 assert.equal(coverageScale([busy],'combined',{npcs:0,words:0},metrics).value(busy),0);
 assert.equal(coverageScale([],'npcs',{},metrics).max,0);
});
