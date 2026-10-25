import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkDestinations,artworkPrompt,assignArtwork} from './artwork';

const state='{"npcs":{"areas":{"name":"Guide","description":"A guide","hiddenInfo":"SECRET"}},"premadeCharacters":[{"name":"Traveler"}],"regions":{"npcs":{"name":"Coast"}},"locations":{"areas":{"name":"Harbor","areas":{"npcs":{"name":"Dock"}}}},"itemTypes":{"npcs":{"name":"Compass"}},"exact":90071992547409931234,"unknown":1.2300e+42}';
test('artwork catalogs every supported destination with structural upload purposes',()=>{
 const destinations=artworkDestinations(state);
 assert.equal(destinations.length,7);
 for(const [name,target] of [['Guide','NPC_PORTRAIT'],['Traveler','NPC_PORTRAIT'],['Coast','REGION_MAP_IMAGE'],['Harbor','LOCATION_IMAGE'],['Dock · areas','AREA_IMAGE'],['Compass','ITEM_IMAGE']]){
  const destination=destinations.find(item=>item.label===name)!;
  assert.equal(destination.target,target);
  assert.ok(artworkPrompt(destination).includes(name));
 }
 assert.doesNotMatch(artworkPrompt(destinations.find(item=>item.label==='Guide')!),/SECRET|hiddenInfo/);
 assert.deepEqual(destinations.find(item=>item.label==='Traveler')!.path,['premadeCharacters',0,'portraitUrl']);
});
test('assigning absent nested artwork preserves exact numbers and unrelated fields',()=>{
 for(const label of ['Guide','Traveler','Coast','Harbor','Dock · areas','Compass']){
  const destination=artworkDestinations(state).find(item=>item.label===label)!;
  const result=assignArtwork(state,'{}',destination.id,'https://images.example/art.webp');
  assert.match(result.source,/90071992547409931234/);
  assert.match(result.source,/1\.2300e\+42/);
  assert.equal(artworkDestinations(result.source).find(item=>item.id===destination.id)!.url,'https://images.example/art.webp');
  assert.equal(result.creationDetails,'{}');
 }
});
test('raw covers use creation metadata; envelope covers use the authored envelope',()=>{
 const details='{"title":"World","tags":["test"]}';
 const raw=assignArtwork(state,details,'creation-cover','https://images.example/cover.png');
 assert.equal(raw.source,state);
 assert.equal(JSON.parse(raw.creationDetails).title,'World');
 assert.equal(artworkDestinations(state,raw.creationDetails)[0].url,'https://images.example/cover.png');
 assert.equal(artworkDestinations(state,raw.creationDetails)[0].target,'WORLD_COVER');
 assert.match(artworkPrompt(artworkDestinations(state)[0]),/1000 × 1000/);
 const source='{"world":{"shortId":"keep","initialGameState":'+state+'}}';
 const cover=artworkDestinations(source).find(item=>item.category==='World cover')!;
 assert.deepEqual(cover.path,['world','image']);
 assert.equal(cover.target,'WORLD_COVER');
 const assigned=assignArtwork(source,details,cover.id,'https://images.example/cover.png');
 assert.equal(assigned.creationDetails,details);
 assert.equal(JSON.parse(assigned.source).world.shortId,'keep');
 assert.equal(JSON.parse(assigned.source).world.image,'https://images.example/cover.png');
 assert.match(assigned.source,/90071992547409931234/);
});
test('artwork assignment rejects removed destinations and unsafe URLs',()=>{
 assert.throws(()=>assignArtwork(state,'{}','missing','https://images.example/a.png'),/no longer exists/);
 assert.throws(()=>assignArtwork(state,'{}','creation-cover','javascript:alert(1)'),/HTTPS/);
});
test('empty nullable artwork fields remain selectable without replacing malformed parents',()=>{
 const source='{"initialGameState":{"npcs":{"guide":{"name":"Guide","portraitUrl":null}},"itemTypes":{"key":{"name":"Key","imageUrl":null}},"regions":{"bad":{"images":false}}},"image":null}';
 const destinations=artworkDestinations(source);
 for(const label of ['Guide','Key','World cover']){
  const destination=destinations.find(item=>item.label===label)!;
  assert.ok(destination,label);
  if(label==='World cover')assert.equal(destination.target,'WORLD_COVER');
  const assigned=assignArtwork(source,'{}',destination.id,'https://images.example/image.png');
  assert.equal(artworkDestinations(assigned.source).find(item=>item.id===destination.id)!.url,'https://images.example/image.png');
  assert.equal(JSON.parse(assigned.source).initialGameState.regions.bad.images,false);
 }
 assert.equal(destinations.some(item=>item.category==='Region maps'),false);
});
