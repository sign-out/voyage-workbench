import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimePackList,runtimeSize,type RuntimePackStatus} from './RuntimePacks';

const state:RuntimePackStatus={edition:'lightweight',providers:[{id:'claude',installed:false,version:'2.1.295',downloadBytes:125829120}],busy:false,phase:'idle',message:'',downloaded:0,total:0,canInstall:true};
const render=(status:RuntimePackStatus,blocked=false)=>renderToStaticMarkup(<RuntimePackList status={status} blocked={blocked} onInstall={()=>{}} onPermission={()=>{}} onCancel={()=>{}}/>);
test('runtime choices show exact scope, size, source and restart warning',()=>{
 const html=render(state);
 for(const text of ['Install Claude Code','120.0 MiB','official upstream','Workbench release repository','may restart','No inference','API fallback'])assert.ok(html.includes(text),text);
 assert.equal(runtimeSize(1048576),'1.0 MiB');
});
test('runtime installation cannot discard unsaved settings or bypass Android permission',()=>{
 assert.match(render(state,true),/disabled=""/);
 assert.match(render(state,true),/Save your connection settings/);
 const html=render({...state,canInstall:false});
 assert.match(html,/Allow Android installation prompts/);
 assert.match(html,/disabled=""/);
});
test('full edition does not offer downloads and active installs offer cancellation',()=>{
 assert.ok(!render({...state,edition:'full'}).includes('Install Claude Code'));
 const html=render({...state,busy:true,phase:'downloading',total:100,downloaded:30});
 assert.match(html,/Cancel runtime installation/);
 assert.match(html,/progress/);
 assert.match(html,/disabled=""/);
});
