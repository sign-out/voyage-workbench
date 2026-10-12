import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash} from '../../../packages/core/project';
import {BuilderNotes,NotePlanning} from './BuilderNotes';
import {NoteHistory} from './NoteHistory';
test('notes show an explicit planning flag, contextual attachment and no playable-world edit',()=>{
 let project=create('p','World','{"combatSettings":{}}',1);project=reduce(project,{type:'builderNote',baseHash:hash(project.activeSource),note:{id:'n',path:['combatSettings'],text:'Deepen fatigue <carefully>',planning:true}});
 const html=renderToStaticMarkup(<BuilderNotes project={project} path={['combatSettings']} busy={false} command={async()=>{}}/>);
 assert.match(html,/Ask the planning model to address this note/);assert.match(html,/checked=""/);assert.match(html,/Deepen fatigue &lt;carefully&gt;/);assert.match(html,/Note attachment path/);assert.match(html,/not world exports/);
});
test('addressed notes are separated from pending and distinguish suggestions from applied evidence',()=>{
 let project=create('p','World','{"system":{}}',1);
 project=reduce(project,{type:'builderNote',baseHash:hash(project.activeSource),note:{id:'n',path:['system'],text:'Deepen system',planning:true}});
 project=reduce(reduce(project,{type:'prepareTask',id:'plan',attempt:'a',kind:'plan',addressNotes:true}),{type:'taskRunning',taskId:'plan',attempt:'a'});
 project=reduce(project,{type:'proposeWorkOrder',id:'suggestion',taskId:'plan',attempt:'a',order:{objective:'Deepen system',requirements:['Preserve existing behavior'],allowedPaths:[['system']]}});
 project=reduce(project,{type:'recordNotePlan',taskId:'plan',attempt:'a',noteId:'n',state:'proposed',explanation:'Scoped suggestion ready',proposalId:'suggestion'});
 project=reduce(project,{type:'taskDone',taskId:'plan',attempt:'a'});
 const html=renderToStaticMarkup(<NotePlanning project={project} busy={false} onStart={async()=>{}} onNavigate={()=>{}}/>);assert.match(html,/Addressed notes · 1/);assert.match(html,/Address project notes · 0/);assert.match(html,/not necessarily implemented/);
 const history=renderToStaticMarkup(<NoteHistory project={project} note={project.builderNotes![0]}/>);assert.match(history,/1 work suggestions · 0 staged changes · 0 applied changes/);assert.match(history,/Work Order: Deepen system/);assert.doesNotMatch(history,/Explore applied changes/);
});
test('planning action shows flagged count, explicit request warning and draft blocker',()=>{
 let project=create('p','World','{}',1);const render=()=>renderToStaticMarkup(<NotePlanning project={project} busy={false} onStart={async()=>{}} onNavigate={()=>{}}/>);
 assert.match(render(),/Address project notes · 0/);assert.match(render(),/disabled=""/);
 project=reduce(project,{type:'builderNote',baseHash:hash(project.activeSource),note:{id:'n',path:[],text:'Rewrite background',planning:true}});assert.match(render(),/Address project notes · 1/);assert.match(render(),/API providers may charge/);
 project=reduce(project,{type:'draft',baseHash:hash(project.activeSource),path:[],text:'{}'});assert.match(render(),/Apply or discard the world draft/);assert.match(render(),/disabled=""/);
});
