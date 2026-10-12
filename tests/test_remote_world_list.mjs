import assert from 'node:assert/strict';
import test from 'node:test';
import {RemoteWorldPages} from '../web/remote-world-list.js';

test('loads successive pages, appends unique worlds and stops at totalCount', async () => {
  const calls = [];
  const pages = new RemoteWorldPages(async page => {
    calls.push(page);
    return {data: {totalCount: 3, worlds: page === 0 ? [{shortId:'a'}, {shortId:'b'}] : [{shortId:'b'}, {shortId:'c'}]}};
  });
  await pages.load();
  assert.equal(pages.done, false);
  await pages.load();
  await pages.load();
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(pages.worlds.map(w => w.shortId), ['a', 'b', 'c']);
  assert.equal(pages.done, true);
});

test('failed later page preserves prior worlds and retries the same page', async () => {
  let fail = true;
  const calls = [];
  const pages = new RemoteWorldPages(async page => {
    calls.push(page);
    if (page === 1 && fail) throw new Error('Offline');
    return {worlds: page === 0 ? [{shortId:'a'}] : []};
  });
  await pages.load();
  await pages.load();
  assert.equal(pages.worlds.length, 1);
  assert.equal(pages.nextPage, 1);
  assert.equal(pages.error, 'Offline');
  fail = false;
  await pages.load();
  assert.deepEqual(calls, [0, 1, 1]);
  assert.equal(pages.done, true);
});

test('connection reset ignores stale replies and restarts at page zero', async () => {
  let finish;
  const pages = new RemoteWorldPages(() => new Promise(resolve => {finish = resolve;}));
  const first = pages.load();
  assert.equal(pages.loading, true);
  pages.reset();
  finish({data:{worlds:[{shortId:'old-account'}],totalCount:1}});
  await first;
  assert.equal(pages.worlds.length, 0);
  assert.equal(pages.nextPage, 0);
  assert.equal(pages.started, false);
});

test('deduplicates concurrent clicks and stops a repeated page without metadata', async () => {
  let finish;
  let calls = 0;
  const pages = new RemoteWorldPages(() => {calls++; return new Promise(resolve => {finish = resolve;});});
  const first = pages.load();
  await pages.load();
  assert.equal(calls, 1);
  finish({worlds:[{shortId:'a'}]});
  await first;
  const second = pages.load();
  finish({worlds:[{shortId:'a'}]});
  await second;
  assert.equal(pages.done, true);
  assert.equal(pages.worlds.length, 1);
});

test('malformed envelopes leave the page retryable', async () => {
  const pages = new RemoteWorldPages(async () => ({data:{wrong:[]}}));
  await pages.load();
  assert.match(pages.error, /unexpected world list/);
  assert.equal(pages.nextPage, 0);
  assert.equal(pages.done, false);
});
