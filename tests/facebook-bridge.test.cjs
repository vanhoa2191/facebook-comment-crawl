'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadBridge(url) {
  const listeners = [];
  const window = { __commentCrawlBridge: false, location: { href: url } };
  const document = {};
  const chrome = { runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } } };
  const context = { window, document, chrome, URL, Date, Promise, Array, String, RegExp, Number, Object, Math, WeakMap, WeakSet, Error, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'facebook-bridge.js'), 'utf8'), context);
  return listeners[0];
}

test('Facebook bridge rejects a non-post URL before collection', async () => {
  const listener = loadBridge('https://www.facebook.com/');
  const result = await new Promise(resolve => {
    const keepOpen = listener({ type: 'COMMENT_CRAWL_COLLECT' }, {}, resolve);
    assert.equal(keepOpen, true);
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /bài viết Facebook/);
});

test('Facebook bridge ignores unrelated message types', () => {
  const listener = loadBridge('https://www.facebook.com/');
  assert.equal(listener({ type: 'OTHER' }, {}, () => {}), false);
});
