import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Compass} from 'lucide-react';
import {WorkspaceSettings} from './WorkspaceSettings';
import {WorkbenchNavigation} from './WorkbenchNavigation';
import {moveTool,normalizeNavigation,readNavigation,readTheme,toggleShortcut} from './workspace-preferences';

const ids=['editor','map','characters','mods','changes','validation','plan','review','artwork','publish','base','history','providers','voyage','connection','settings'];
const tabs=ids.map(id=>[id,id,Compass] as const);

test('defaults keep six desktop and four mobile shortcuts, and every tool in the menu',()=>{
 const preferences=normalizeNavigation(null,ids);
 assert.deepEqual(preferences.desktop,['editor','map','characters','plan','review','artwork']);
 assert.deepEqual(preferences.mobile,['editor','map','mods','publish']);
 assert.deepEqual(preferences.order,ids);
});

test('stored preferences handle unknown tools, duplicates, future tools and malformed data',()=>{
 assert.deepEqual(normalizeNavigation({order:['publish','missing','publish'],desktop:['missing','publish','publish'],mobile:[]},ids),{order:['publish',...ids.filter(id=>id!=='publish')],desktop:['publish'],mobile:[]});
 assert.deepEqual(readNavigation({getItem:()=>'{broken'},ids),normalizeNavigation(null,ids));
 assert.deepEqual(readNavigation({getItem:()=>{throw Error('unavailable');}},ids),normalizeNavigation(null,ids));
 assert.equal(normalizeNavigation({desktop:ids,mobile:ids},ids).desktop.length,6);
 assert.equal(normalizeNavigation({desktop:ids,mobile:ids},ids).mobile.length,4);
 const previousMobile=['editor','map','characters','review'];
 assert.deepEqual(readNavigation({getItem:()=>JSON.stringify({mobile:previousMobile})},ids).mobile,previousMobile);
});

test('any available tool can replace a shortcut without affecting the other surface',()=>{
 const defaults=normalizeNavigation(null,ids);
 assert.equal(toggleShortcut(defaults,'mobile','characters'),defaults);
 const changed=toggleShortcut(toggleShortcut(defaults,'mobile','mods'),'mobile','characters');
 assert.deepEqual(changed.mobile,['editor','map','publish','characters']);
 assert.deepEqual(changed.desktop,defaults.desktop);
 assert.equal(toggleShortcut(changed,'mobile','missing'),changed);
 assert.deepEqual(readNavigation({getItem:()=>JSON.stringify(changed)},ids),changed);
});

test('reordering drives both the menu and shortcuts, including mobile-only tools',()=>{
 let preferences=normalizeNavigation({order:['publish','editor'],desktop:['editor'],mobile:['publish']},ids);
 preferences=moveTool(preferences,'editor',-1);
 assert.deepEqual(preferences.order.slice(0,2),['editor','publish']);
 assert.equal(moveTool(preferences,'editor',-1),preferences);
 assert.equal(moveTool(preferences,'missing',1),preferences);
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="publish" proposalCount={0} preferences={preferences} onNavigate={()=>true}/>);
 assert.ok(markup.includes('class="tool-button mobile-primary selected"'));
 assert.ok(markup.includes('class="tool-button desktop-primary "'));
 const menu=markup.slice(markup.indexOf('tools-menu-items'));
 assert.ok(menu.indexOf('<span>editor</span>')<menu.indexOf('<span>publish</span>'));
 assert.equal((menu.match(/<button(?:\s|>)/g)||[]).length,ids.length);
});

test('no shortcuts still leaves all tools and settings reachable',()=>{
 const markup=renderToStaticMarkup(<WorkbenchNavigation tabs={tabs} activeTab="settings" proposalCount={0} preferences={normalizeNavigation({desktop:[],mobile:[]},ids)} onNavigate={()=>true}/>);
 assert.equal((markup.match(/class="tool-button /g)||[]).length,0);
 assert.ok(markup.includes('<span>settings</span>'));
});

test('appearance remains compatible with existing preferences and rejects invalid themes',()=>{
 for(const theme of ['dark','light','system'] as const)assert.equal(readTheme({getItem:()=>theme}),theme);
 assert.equal(readTheme({getItem:()=>null}),'dark');
 assert.equal(readTheme({getItem:()=>'invalid'}),'dark');
 assert.equal(readTheme({getItem:()=>{throw Error('unavailable');}}),'dark');
 const markup=renderToStaticMarkup(<WorkspaceSettings tabs={tabs} theme="dark" onThemeChange={()=>{}} navigation={normalizeNavigation(null,ids)} onNavigationChange={()=>{}} notice=""/>);
 assert.ok(markup.includes('aria-label="Color theme"'));
 assert.ok(markup.includes('aria-label="publish mobile shortcut"'));
 assert.ok(markup.includes('Reset tool layout'));
});
