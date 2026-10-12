import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Compass} from 'lucide-react';
import {WorkbenchNavigation} from './WorkbenchNavigation';

const toolIds=['editor','map','characters','mods','changes','validation','plan','review','artwork','publish','base','history','providers','voyage','connection'];
const tabs=toolIds.map(id=>[id,id,Compass] as const);

test('all fifteen tools remain available in the adaptive navigation',()=>{
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="editor" proposalCount={0} onNavigate={()=>true}/>);
 const menu=markup.slice(markup.indexOf('tools-menu-items'));
 for(const id of toolIds)assert.ok(menu.includes('<span>'+id+'</span>'),id+' is missing');
 assert.equal((menu.match(/<button(?:\s|>)/g)||[]).length,15);
 assert.equal((markup.match(/class="tool-button /g)||[]).length,6);
 assert.equal((markup.match(/mobile-primary/g)||[]).length,4);
});

test('supplementary tools expose the active selection without losing the primary tools',()=>{
 for(const id of ['mods','validation','publish','providers','voyage','connection']){
  const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab={id} proposalCount={0} onNavigate={()=>true}/>);
  assert.ok(markup.includes('<strong class="current-tool">'+id+'</strong>'));
  assert.equal((markup.match(/aria-current="page"/g)||[]).length,1);
 }
});

test('proposal counts appear in the primary navigation and the full tool menu',()=>{
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="review" proposalCount={3} onNavigate={()=>true}/>);
 assert.ok(markup.includes('aria-label="3 proposals"'));
 assert.equal((markup.match(/aria-current="page"/g)||[]).length,2);
 assert.ok(markup.includes('<b>3</b>'));
});
