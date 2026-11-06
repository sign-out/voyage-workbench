import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {diff,proposalDiff,selectProposalChanges} from '../../../packages/core/document';
import {ImportReplacementNotice,ProposalFormattingNotice,ProposalDiff} from './ProposalDiff';

test('import notice distinguishes replacement data from schema migration and merge',()=>{
 const html=renderToStaticMarkup(<ImportReplacementNotice/>);
 for(const text of ['not a JSON Schema','replacement proposal, not a merge or schema migration','proposed for removal','Nothing changes until you accept','new local project'])assert.ok(html.includes(text));
});
test('local reviews omit order-only noise, retain current formatting and explain actual changes',()=>{
 const detail='Unchanged authored content '.repeat(5000),before=JSON.stringify({first:detail,second:1}),after=JSON.stringify({second:2,first:detail});
 const changes=diff(before,after).changes;
 assert.deepEqual(changes.map(change=>change.kind),['order','changed']);
 const html=renderToStaticMarkup(<ProposalDiff change={changes[0]}/>);
 assert.match(html,/Object key order changed/);assert.match(html,/removals are listed separately/);assert.match(html,/Show exact object JSON/);assert.match(html,/aria-expanded="false"/);
 assert.ok(html.includes('first'));assert.ok(html.includes('second'));assert.ok(!html.includes(detail));assert.ok(html.length<2000);
 const value=renderToStaticMarkup(<ProposalDiff change={changes[1]}/>);assert.match(value,/>1<\/pre>/);assert.match(value,/>2<\/pre>/);
 const report=proposalDiff(before,after),notice=renderToStaticMarkup(<ProposalFormattingNotice/>);
 assert.equal(report.total,1);assert.deepEqual(report.changes.map(change=>change.path),[['second']]);
 assert.match(notice,/Formatting-only differences are kept automatically/);assert.match(notice,/Added or removed fields and array reordering still need review/);
 const preview=report.changes.map(change=>renderToStaticMarkup(<ProposalDiff change={change}/>)).join('');assert.ok(!preview.includes(detail));assert.ok(!preview.includes('Object key order changed'));
 assert.equal(selectProposalChanges(before,JSON.stringify({second:1,first:detail})),before);
});
test('real added and removed content remains visible in proposal previews',()=>{
 const changes=diff('{"removed":"old value"}','{"added":"new value"}').changes;
 const html=changes.map(change=>renderToStaticMarkup(<ProposalDiff change={change}/>)).join('');
 for(const text of ['old value','new value','Not present','Removed'])assert.ok(html.includes(text));
 assert.ok(!html.includes('Object key order changed'));
});
