import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkspaceSession,watchWorkspaceLifecycle,workspaceSessionKey} from './workspace-session';

const session={projectId:'world-one',tab:'artwork',lastEditorScreen:'artwork',path:['characters',0,'description'],mobileEditor:true,editorView:'json',showProjects:false};
const read=(value:unknown,id='world-one')=>readWorkspaceSession({getItem:key=>{assert.equal(key,workspaceSessionKey);return JSON.stringify(value);}},id,['editor','artwork','plan']);
test('Android workspace restore retains world, tool, editor mode, and selection',()=>{assert.deepEqual(read(session),session);assert.equal(read(session,'world-two'),null);});
test('invalid or unavailable session storage cannot prevent opening the saved world',()=>{
 assert.equal(read(null),null);
 assert.equal(readWorkspaceSession({getItem:()=>{throw Error('Unavailable');}},'world-one',['editor']),null);
 assert.equal(readWorkspaceSession({getItem:()=>'{bad'},'world-one',['editor']),null);
 assert.deepEqual(read({...session,tab:'removed',lastEditorScreen:'plan',path:['characters',-1],editorView:'unknown'}),{...session,tab:'editor',lastEditorScreen:'editor',path:[],editorView:'form'});
});
test('native wake and WebView visibility events resume; backgrounding flushes; teardown removes listeners',()=>{
 const nativeWindow=new EventTarget(),nativeDocument=Object.assign(new EventTarget(),{visibilityState:'visible'});let resumes=0,pauses=0;
 const stop=watchWorkspaceLifecycle(()=>resumes++,()=>pauses++,{window:nativeWindow,document:nativeDocument});
 nativeWindow.dispatchEvent(new Event('voyage-resume'));nativeWindow.dispatchEvent(new Event('pageshow'));nativeDocument.dispatchEvent(new Event('visibilitychange'));assert.equal(resumes,3);
 nativeDocument.visibilityState='hidden';nativeDocument.dispatchEvent(new Event('visibilitychange'));nativeWindow.dispatchEvent(new Event('voyage-pause'));assert.equal(pauses,2);
 stop();nativeWindow.dispatchEvent(new Event('voyage-resume'));nativeWindow.dispatchEvent(new Event('voyage-pause'));nativeWindow.dispatchEvent(new Event('pageshow'));nativeDocument.dispatchEvent(new Event('visibilitychange'));assert.equal(resumes,3);assert.equal(pauses,2);
});
