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


class MockElement {
  constructor(tagName, attrs, ownText) {
    this.tagName = tagName.toLowerCase();
    this.attrs = attrs || {};
    this.ownText = ownText || '';
    this.innerText = this.ownText;
    this.textContent = this.ownText;
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
    this.id = this.attrs.id || '';
    this.scrollHeight = 100;
  }
  append(...children) {
    for (const child of children) { child.parentElement = this; this.children.push(child); }
    return this;
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  getClientRects() { return [1]; }
  closest(selector) {
    let current = this;
    while (current) {
      if (selector === '[role="article"]' && current.getAttribute('role') === 'article') return current;
      current = current.parentElement;
    }
    return null;
  }
  matches(selector) {
    const alternatives = selector.split(',').map(item => item.trim());
    return alternatives.some(sel => {
      if (sel === '[role="article"]') return this.getAttribute('role') === 'article';
      if (sel === '[role="main"]') return this.getAttribute('role') === 'main';
      if (sel === 'main') return this.tagName === 'main';
      if (sel === 'a[href]') return this.tagName === 'a' && !!this.getAttribute('href');
      if (sel === 'div[dir="auto"]') return this.tagName === 'div' && this.getAttribute('dir') === 'auto';
      if (sel === 'span[dir="auto"]') return this.tagName === 'span' && this.getAttribute('dir') === 'auto';
      if (sel === 'time[datetime]') return this.tagName === 'time' && !!this.getAttribute('datetime');
      if (sel === 'abbr[title]') return this.tagName === 'abbr' && !!this.getAttribute('title');
      if (sel === '[data-utime]') return !!this.getAttribute('data-utime');
      if (sel === 'button') return this.tagName === 'button';
      if (sel === '[role="button"]') return this.getAttribute('role') === 'button';
      return false;
    });
  }
  querySelectorAll(selector) {
    const result = [];
    const visit = node => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}

test('Facebook bridge collects comments and links a nested reply to its parent', async () => {
  const postUrl = 'https://www.facebook.com/sample.page/posts/12345';
  const post = new MockElement('div', { role: 'article', 'aria-label': 'Post by Sample Page', 'data-testid': 'post-container' });
  const mainComment = new MockElement('div', { role: 'article', id: 'comment-101' });
  mainComment.append(
    new MockElement('a', { href: 'https://www.facebook.com/anna' }, 'Anna'),
    new MockElement('div', { dir: 'auto' }, 'A main comment with useful context.'),
    new MockElement('time', { datetime: '2026-10-23T10:00:00.000Z' }, '2 hours ago'),
    new MockElement('a', { href: postUrl + '?comment_id=101' }, 'Comment permalink'),
    new MockElement('button', {}, 'Reply 1 reply')
  );
  const nestedReply = new MockElement('div', { role: 'article', id: 'reply-202' });
  nestedReply.append(
    new MockElement('a', { href: 'https://www.facebook.com/bob' }, 'Bob'),
    new MockElement('div', { dir: 'auto' }, 'A nested reply to Anna.'),
    new MockElement('time', { datetime: '2026-10-23T10:15:00.000Z' }, '1 hour ago'),
    new MockElement('a', { href: postUrl + '?reply_comment_id=202' }, 'Reply permalink'),
    new MockElement('button', {}, 'Reply')
  );
  mainComment.append(nestedReply);
  post.append(new MockElement('a', { href: postUrl }, 'Post permalink'), mainComment);

  const main = new MockElement('div', { role: 'main' }).append(post);
  const document = {
    title: 'Sample Page post',
    body: main,
    documentElement: { scrollHeight: 200 },
    querySelector(selector) {
      if (selector === '[role="main"]' || selector === 'main') return main;
      return null;
    },
    querySelectorAll(selector) { return main.querySelectorAll(selector); }
  };
  const window = {
    __commentCrawlBridge: false,
    location: { href: postUrl },
    scrollY: 100,
    scrollTo() {}
  };
  const listeners = [];
  const context = {
    window, document, URL, Date, Promise, Array, String, RegExp, Number, Object, Math, WeakMap, WeakSet, Error,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
    chrome: { runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'facebook-bridge.js'), 'utf8'), context);
  const result = await new Promise(resolve => {
    assert.equal(listeners[0]({ type: 'COMMENT_CRAWL_COLLECT' }, {}, resolve), true);
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.comments.length, 2);
  assert.equal(result.comments[0].authorName, 'Anna');
  assert.equal(result.comments[0].authorProfileId, 'username:anna');
  assert.equal(result.comments[0].text, 'A main comment with useful context.');
  assert.equal(result.comments[0].depth, 0);
  assert.equal(result.comments[1].authorName, 'Bob');
  assert.equal(result.comments[1].text, 'A nested reply to Anna.');
  assert.equal(result.comments[1].depth, 1);
  assert.equal(result.comments[1].parentCommentId, result.comments[0].sourceKey);
});
