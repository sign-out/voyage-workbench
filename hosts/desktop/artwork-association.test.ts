import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from './store';
import {artworkDestinations,assignArtwork} from '../../packages/core/artwork';
import {charactersInspect} from '../../packages/core/features';
import {hash} from '../../packages/core/project';

test('all artwork associations survive durable project close and reopen at their exact destinations',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'voyage-artwork-association-'));
 let store=new Store(directory);
 try{
  const state='{"npcs":{"guide":{"name":"guide"},"other":{"name":"other"}},"premadeCharacters":[{"name":"Hero"},{"name":"Traveler"}],"regions":{"coast":{"name":"Coast"}},"locations":{"port":{"name":"Port","areas":{"dock":{"name":"Dock"}}}},"itemTypes":{"key":{"name":"Key"}},"exact":90071992547409931234,"unknown":1.2300e+42}';
  const sources=[state,'{"initialGameState":'+state+'}','{"world":{"title":"World","initialGameState":'+state+'}}','{"data":{"world":{"title":"World","initialGameState":'+state+'}}}'];
  const records=sources.map((source,index)=>{
   const project=store.create('Artwork '+index,source).project!,id=project.id,expected=new Map<string,string>(),detailKey='creation-details:'+id;
   for(const [position,destination] of artworkDestinations(source).entries()){
    const current=store.project(id),details=store.setting(detailKey)||'{}',url='https://images.example/'+index+'-'+position+'.png';
    const result=assignArtwork(current.activeSource,details,destination.id,url);
    if(destination.path){
     const receipt=store.dispatch(id,{type:'edit',path:[],source:result.source,baseHash:hash(current.activeSource)});
     assert.equal(receipt.project!.activeSource,result.source);
    }else store.setting(detailKey,result.creationDetails);
    expected.set(destination.id,url);
   }
   assert.equal(store.project(id).candidates.length,0);
   return {id,detailKey,expected};
  });
  store.close();store=new Store(directory);
  for(const record of records){
   const restored=store.project(record.id),destinations=artworkDestinations(restored.activeSource,store.setting(record.detailKey)||'{}');
   for(const destination of destinations)assert.equal(destination.url,record.expected.get(destination.id),destination.id);
   assert.equal(destinations.length,record.expected.size);
   assert.equal(new Set(destinations.map(destination=>destination.url)).size,destinations.length);
   for(const character of charactersInspect(restored.activeSource,[]).characters)assert.equal(character.portrait,record.expected.get(JSON.stringify(character.path.concat('portraitUrl'))));
   assert.match(restored.activeSource,/90071992547409931234/);
   assert.match(restored.activeSource,/1\.2300e\+42/);
   const destination=destinations.find(entry=>entry.path)!;
   assert.throws(()=>store.dispatch(record.id,{type:'edit',path:[],source:assignArtwork(restored.activeSource,'{}',destination.id,'https://images.example/stale.png').source,baseHash:hash('stale source')}),/world changed/i);
   assert.equal(store.project(record.id).activeSource,restored.activeSource);
  }
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
