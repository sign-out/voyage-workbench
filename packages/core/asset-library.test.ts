import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectMedia,latitudeUrl,mergeLibraryAsset,reusableRemote,type LibraryAsset} from './asset-library';
const record:LibraryAsset={id:'a',name:'A',aliases:[],kind:'audio',mime:'audio/wav',created:1,storageId:'bytes',sha256:'hash',remote:[],tags:[]};
test('global asset merge deduplicates local content and preserves local bytes and hosted URLs',()=>{
 const first=mergeLibraryAsset([record],{...record,id:'b',name:'B',remote:[{url:'https://example.com/music.mp3',state:'reserved',created:2,expiresAt:3}]});
 assert.equal(first.length,1);assert.equal(first[0].storageId,'bytes');assert.deepEqual(first[0].aliases,['B']);
 const second=mergeLibraryAsset(first,{...record,remote:[{url:'https://example.com/music.mp3',state:'durable',created:3}]});
 assert.equal(second[0].remote[0].state,'durable');assert.equal(reusableRemote(first[0],undefined,4),undefined);assert.ok(reusableRemote(second[0],undefined,4));
 const reindexed=mergeLibraryAsset(first,{...record,remote:[{url:'https://example.com/music.mp3',state:'existing',created:4}]});assert.equal(reindexed[0].remote[0].state,'reserved');assert.equal(reindexed[0].remote[0].expiresAt,3);
});
test('Latitude URL classification rejects lookalikes and credentials',()=>{
 assert.ok(latitudeUrl('https://latitude-standard-pull-zone-1.b-cdn.net/music.mp3'));assert.equal(latitudeUrl('https://latitude-standard-pull-zone-1.b-cdn.net.evil.test/music.mp3'),false);assert.equal(latitudeUrl('https://key@latitude-standard-pull-zone-1.b-cdn.net/music.mp3'),false);
});
test('adding an uploaded URL consolidates previously separate URL-only and local catalog records',()=>{
 const url='https://example.com/music.mp3',remote={...record,id:'remote',storageId:undefined,sha256:undefined,bytes:undefined,mime:'audio/mpeg',remote:[{url,state:'existing' as const,created:1}]};
 const merged=mergeLibraryAsset([record,remote],{...record,remote:[{url,state:'existing',created:2}]});assert.equal(merged.length,1);assert.equal(merged[0].storageId,'bytes');assert.equal(merged[0].remote.length,1);
});
test('media hashing uses bytes rather than names and catches unsupported media',()=>{
 const wav='data:audio/wav;base64,'+Buffer.from('RIFFxxxxWAVEfmt ').toString('base64');assert.equal(inspectMedia(wav).kind,'audio');assert.equal(inspectMedia(wav.replace('audio/wav','application/octet-stream')).sha256,inspectMedia(wav).sha256);assert.throws(()=>inspectMedia('data:audio/mpeg;base64,'+Buffer.from('<script>').toString('base64')),/valid file headers/);
});
