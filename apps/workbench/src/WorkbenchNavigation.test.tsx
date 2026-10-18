import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Compass} from 'lucide-react';
import {WorkbenchNavigation,MobileWorkspaceMode} from './WorkbenchNavigation';

const toolIds=['editor','map','characters','mods','changes','validation','plan','review','artwork','publish','base','history','providers','voyage','connection'];
const tabs=toolIds.map(id=>[id,id,Compass] as const);

test('all fifteen tools remain available in the adaptive navigation',()=>{
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="editor" proposalCount={0} onNavigate={()=>true}/>);
 const menu=markup.slice(markup.indexOf('tools-menu-items'));
 for(const id of toolIds)assert.ok(menu.includes('<span>'+id+'</span>'),id+' is missing');
 assert.equal((menu.match(/<button(?:\s|>)/g)||[]).length,15);
 assert.equal((markup.match(/class="tool-button /g)||[]).length,8);
 assert.equal((markup.match(/mobile-primary/g)||[]).length,4);
});

test('mobile mode returns to the previous editor tool and keeps navigation guards in control',()=>{
 const calls:string[]=[];
 const mode=MobileWorkspaceMode({activeTab:'plan',editorTab:'map',onNavigate:next=>{calls.push(next);return false;}});
 const [chat,editor]=mode.props.children;
 assert.equal(chat.props['aria-pressed'],true);
 assert.equal(editor.props['aria-pressed'],false);
 assert.equal(editor.props.onClick(),false);
 assert.deepEqual(calls,['map']);
 assert.equal(chat.props.onClick(),false);
 assert.deepEqual(calls,['map','plan']);
});

test('mobile Editor mode falls back to content if passed the chat route',()=>{
 let target='';
 const mode=MobileWorkspaceMode({activeTab:'mods',editorTab:'plan',onNavigate:next=>{target=next;return true;}});
 const [chat,editor]=mode.props.children;
 assert.equal(chat.props['aria-pressed'],false);
 assert.equal(editor.props['aria-pressed'],true);
 editor.props.onClick();
 assert.equal(target,'editor');
});

test('Planning stays in all tools but does not duplicate the mobile Chat mode',()=>{
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="editor" proposalCount={0} onNavigate={()=>true} preferences={{order:toolIds,desktop:['plan'],mobile:['editor','plan','review','voyage']}}/>);
 assert.equal((markup.match(/mobile-primary/g)||[]).length,3);
 assert.match(markup,/desktop-primary [^"]*"><svg[^]*?<span>plan<\/span>/);
 assert.match(markup.slice(markup.indexOf('tools-menu-items')),/<span>plan<\/span>/);
});

test('supplementary tools expose the active selection without losing the primary tools',()=>{
 for(const id of ['mods','validation','publish','providers','voyage','connection']){
  const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab={id} proposalCount={0} onNavigate={()=>true}/>);
  assert.ok(markup.includes('<strong class="current-tool">'+id+'</strong>'));
  assert.equal((markup.match(/aria-current="page"/g)||[]).length,['mods','publish'].includes(id)?2:1);
 }
});

test('proposal counts appear in the primary navigation and the full tool menu',()=>{
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="review" proposalCount={3} onNavigate={()=>true}/>);
 assert.ok(markup.includes('aria-label="3 proposals"'));
 assert.equal((markup.match(/aria-current="page"/g)||[]).length,2);
 assert.ok(markup.includes('<b>3</b>'));
});
