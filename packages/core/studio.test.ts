import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as studio from './studio';
import * as doc from './document';
test('music edits preserve unknown fields and exact world numbers',()=>{
 const source='{"world":{"shortId":"fixed","initialGameState":{"exact":9007199254740993,"gameplayMusicSettings":{"custom":1.2300e+42,"tracks":{}}}}}';
 const added=studio.musicCreate(source,'Travel');assert.match(added,/9007199254740993/);assert.match(added,/1\.2300e\+42/);
 const selected=studio.musicSelect(added,'Travel');assert.throws(()=>studio.musicRemove(selected,'Travel'),/Choose another/);
 assert.equal(studio.musicInspect(studio.musicRemove(studio.musicSelect(selected,''),'Travel')).tracks.length,0);
 assert.throws(()=>studio.musicCreate(added,'Travel'),/already exists/);
});
test('publication editor preserves server identity and validates supported fields',()=>{
 const source='{"world":{"shortId":"fixed","title":"Before","initialGameState":{"exact":1.2300e+42}}}';
 const edited=studio.publicationEdit(source,'title','"After"');doc.assertPackageMetadataUnchanged(source,edited);assert.match(edited,/1\.2300e\+42/);
 assert.throws(()=>studio.publicationEdit(source,'shortId','"other"'),/not author/);
 assert.throws(()=>studio.publicationEdit(source,'tags','[1]'),/text tags/);
 assert.throws(()=>studio.publicationEdit(source,'discordThreadUrl','"http://example.com"'),/HTTPS/);
});
test('asset assignment only changes an existing supported URL field',()=>{
 const source='{"npcs":{"m":{"portraitUrl":"","name":"M"}},"gameplayMusicSettings":{"tracks":{"t":{"variants":[{"url":""}]}}}}';
 assert.equal(studio.assetSlots(source).length,2);assert.match(studio.assignAsset(source,['npcs','m','portraitUrl'],'https://example.com/a.png'),/a.png/);
 assert.throws(()=>studio.assignAsset(source,['npcs','m','name'],'https://example.com/a.png'),/existing authored/);
 assert.throws(()=>studio.mediaUrl('https://key@example.com/a'),/credentials/);
 assert.throws(()=>studio.mediaUrl('https://example.com/a?X-Amz-Signature=secret'),/signed URL/);
 const missing='{"npcs":{"m":{"name":"M"}},"regions":{"r":{"name":"R"}}}';
 assert.match(studio.assignAsset(missing,['regions','r','images','map','imageUrl'],'https://example.com/map.png'),/map.png/);
 const music='{"gameplayMusicSettings":{"tracks":{"t":{"variants":[{"url":""}]}}}}';
 assert.match(studio.assignAsset(music,['gameplayMusicSettings','tracks','t','variants',0,'url'],'https://example.com/audio.mp3'),/audio.mp3/);
});
test('mod analysis separates identical authored values, conflicts, ancestor conflicts and missing sources',()=>{
 const report=studio.modConflicts([{id:'a',source:'{"npcs":{"m":{"name":"M","value":1}},"custom":2}'},{id:'b',source:'{"npcs":{"m":{"name":"M","value":2}},"custom":{"x":1}}'},{id:'unknown'},{id:'pinned',version:2,source:'{}'}]);
 assert.equal(report.findings.filter(finding=>finding.kind==='conflict').length,2);assert.equal(report.findings.filter(finding=>finding.kind==='shared').length,1);assert.deepEqual(report.unknown,['unknown','pinned']);
 assert.equal(studio.modConflicts([{id:'a',source:'{"x":1}'},{id:'b',source:'{"x":2}'}],0).truncated,true);
});
