import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '../../../packages/core/project';
import {MusicEditor,SystemsEditor,PublicationDetails} from './StudioEditors';
import {AssetLibrary} from './AssetLibrary';
import {ModConflictReview,modCatalog} from './ModConflictReview';
test('remote mod inspection preserves exact numeric lexemes rather than rounded parsed values',()=>{
 const catalog=modCatalog('{"data":{"myMods":[{"world":{"shortId":"a","version":2,"initialGameState":{"counter":9007199254740993}}},{"world":{"shortId":"b","version":2,"initialGameState":{"counter":9007199254740992}}}]}}');
 assert.match(catalog[0].exactSource,/9007199254740993/);
 const html=renderToStaticMarkup(<ModConflictReview project={create('p','World','{}',1)} mods={[{shortId:'a',version:2},{shortId:'b',version:2}]} catalog={catalog}/>);
 assert.match(html,/1 displayed conflicts/);assert.match(html,/9007199254740993/);
});
test('music and library are first-class without automatic world creation or uploads',()=>{
 const project=create('p','World','{}',1),props={project,command:async()=>{},receive:()=>{},onReview:()=>{}};
 const music=renderToStaticMarkup(<MusicEditor {...props}/>);assert.match(music,/Review adding music settings/);assert.match(music,/Nothing is added just by opening/);
 const library=renderToStaticMarkup(<AssetLibrary command={async()=>{}} onReview={()=>{}}/>);assert.match(library,/Bulk add files/);assert.match(library,/shared by every project/);assert.match(library,/Latitude URLs/);assert.match(library,/Music upload journal/);
});
test('systems distinguish runtime narrator instructions and preserve peer editing',()=>{
 const html=renderToStaticMarkup(<SystemsEditor project={create('p','World','{"combatSettings":{}}',1)} command={async()=>{}} receive={()=>{}} onReview={()=>{}} references={[{tab:'mechanics',section:'combatSettings',title:'Combat',summary:'Rules'}]}/>);
 assert.match(html,/not the workbench/);assert.match(html,/Combat/);assert.match(html,/Form and JSON share/);
});
test('publication author fields do not expose editable package identity',()=>{
 const project=create('p','World','{"world":{"shortId":"fixed","title":"Public","initialGameState":{}}}',1);
 const html=renderToStaticMarkup(<PublicationDetails project={project} command={async()=>{}} receive={()=>{}} onReview={()=>{}}/>);
 assert.match(html,/Public title/);assert.match(html,/Short description/);assert.match(html,/This package is a mod/);assert.match(html,/Prevent remixing/);assert.doesNotMatch(html,/value="fixed"/);assert.match(html,/Review changes/);
});
test('mod review exposes real conflicts and unknown sources rather than claiming complete coverage',()=>{
 const project=create('p','World','{}',1);project.attachments=[{id:'a',name:'a.json',source:'{"npcs":{"m":{"name":"A"}}}'},{id:'b',name:'b.json',source:'{"npcs":{"m":{"name":"B"}}}'}];
 const html=renderToStaticMarkup(<ModConflictReview project={project} mods={[{shortId:'a'},{shortId:'b'},{shortId:'missing'}]} catalog={[]}/>);assert.match(html,/1 displayed conflicts/);assert.match(html,/Coverage unknown for: missing/);assert.match(html,/Conflicting authored values/);assert.match(html,/does not predict engine precedence/);
});
