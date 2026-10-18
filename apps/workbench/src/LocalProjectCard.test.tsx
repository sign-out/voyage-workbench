import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocalProjectCard} from './LocalProjectCard';

const props={project:{id:'local',name:'My world',updated:0,status:'active'},busy:false,current:false,onOpen:()=>{},onClose:()=>{},onStatus:()=>{},onDelete:()=>{}};

test('local projects expose trash separately from opening the workspace',()=>{
 const markup=renderToStaticMarkup(<LocalProjectCard {...props}/>);
 assert.match(markup,/Move to trash/);
 assert.doesNotMatch(markup,/Delete permanently|Close project/);
 assert.equal((markup.match(/<button/g)||[]).length,2);
});

test('an open project can be closed without deleting it',()=>{
 const markup=renderToStaticMarkup(<LocalProjectCard {...props} current/>);
 assert.match(markup,/Close project/);
 assert.match(markup,/Open now/);
 assert.doesNotMatch(markup,/Delete permanently/);
});

test('trash offers restore and permanent deletion, with all actions disabled while busy',()=>{
 const markup=renderToStaticMarkup(<LocalProjectCard {...props} project={{...props.project,status:'trashed'}} busy/>);
 assert.match(markup,/Restore project/);
 assert.match(markup,/Delete permanently/);
 assert.doesNotMatch(markup,/Move to trash/);
 assert.equal((markup.match(/disabled=""/g)||[]).length,3);
});
