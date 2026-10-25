import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce} from '../../../packages/core/project';
import {ChatPlanReview,readChatPlanDraft,acknowledgeChatPlanDraft} from './ChatPlanReview';
import {ChatPlanningPanel} from './ChatPlanningPanel';
test('draft loading is project scoped and preserves stale revisions for conflict checks',()=>{
 const project=reduce(create('p','World','{}',1),{type:'chatPlan',expectedRevision:0,plan:{title:'Saved',text:'Saved text'}});
 assert.deepEqual(readChatPlanDraft(project,{getItem:key=>{assert.equal(key,'voyage-chat-plan-draft:p');return null;}}),{title:'Saved',text:'Saved text',expectedRevision:1});
 assert.deepEqual(readChatPlanDraft(project,{getItem:()=>JSON.stringify({title:'Draft',text:'Local edits',expectedRevision:0})}),{title:'Draft',text:'Local edits',expectedRevision:0});
 for(const raw of ['invalid','null','{}',JSON.stringify({title:'a',text:'b',expectedRevision:-1}),JSON.stringify({title:'a',text:'b'.repeat(100001),expectedRevision:1})])assert.throws(()=>readChatPlanDraft(project,{getItem:()=>raw}));
});
test('late save receipts rebase the scoped cache without replacing edits made after reopening',()=>{
 const submitted={title:'Plan',text:'Submitted',expectedRevision:0},saved={title:'Plan',text:'Submitted',revision:1,updated:2};
 let raw=JSON.stringify(submitted);
 const storage={getItem:(key:string)=>{assert.equal(key,'voyage-chat-plan-draft:p');return raw;},setItem:(key:string,value:string)=>{assert.equal(key,'voyage-chat-plan-draft:p');raw=value;}};
 assert.equal(acknowledgeChatPlanDraft('p',submitted,saved,storage),true);assert.deepEqual(JSON.parse(raw),{...submitted,expectedRevision:1});
 raw=JSON.stringify({...submitted,text:'New edits after reopening'});
 acknowledgeChatPlanDraft('p',submitted,saved,storage);assert.deepEqual(JSON.parse(raw),{...submitted,text:'New edits after reopening',expectedRevision:1});
 raw=JSON.stringify({...submitted,text:'Already newer',expectedRevision:2});assert.equal(acknowledgeChatPlanDraft('p',submitted,saved,storage),false);assert.equal(JSON.parse(raw).expectedRevision,2);
 assert.equal(acknowledgeChatPlanDraft('p',submitted,saved,{getItem:()=>null,setItem:()=>assert.fail()}),false);
 assert.throws(()=>acknowledgeChatPlanDraft('p',submitted,{...saved,revision:3},storage),/Unexpected/);
});
test('reopening reconciles a saved matching draft but does not silently rebase different edits',()=>{
 const project=reduce(create('p','World','{}',1),{type:'chatPlan',expectedRevision:0,plan:{title:'Saved',text:'Saved text'}});
 const read=(text:string)=>readChatPlanDraft(project,{getItem:()=>JSON.stringify({title:'Saved',text,expectedRevision:0})});
 assert.equal(read('Saved text').expectedRevision,1);assert.equal(read('Different edits').expectedRevision,0);assert.equal(read('Different edits').text,'Different edits');
});
test('review offers local save and explicit scope handoff, rendering imported text inertly',()=>{
 const project=reduce(create('p','World','{}',1),{type:'chatPlan',expectedRevision:0,plan:{title:'<script>bad</script>',text:'<img src=x onerror=bad()>'}});
 const html=renderToStaticMarkup(<ChatPlanReview project={project} busy={false} onSave={async()=>project.chatPlan!} onBuild={async()=>true}/>);
 assert.match(html,/Save plan locally/);assert.match(html,/Build this plan/);assert.match(html,/scope and model review/);assert.match(html,/does not read your conversation/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img/);
 assert.match(renderToStaticMarkup(<ChatPlanningPanel/>),/ChatGPT Chat/);
});
