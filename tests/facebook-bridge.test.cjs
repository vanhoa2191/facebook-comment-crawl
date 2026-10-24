'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadBridge(url) {
  const listeners = [];
  const window = { __commentCrawlBridge: false, location: { href: url } };
  const document = { querySelector() { return null; }, body: null };
  const chrome = { runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } } };
  const context = { window, document, chrome, URL, Date, Promise, Array, String, RegExp, Number, Object, Math, WeakMap, WeakSet, Error, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'facebook-bridge.js'), 'utf8'), context);
  return listeners[0];
}

test('Facebook bridge returns an actionable error when the current Facebook page has no DOM root', async () => {
  const listener = loadBridge('https://www.facebook.com/');
  const result = await new Promise(resolve => {
    const keepOpen = listener({ type: 'COMMENT_CRAWL_COLLECT' }, {}, resolve);
    assert.equal(keepOpen, true);
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /vùng nội dung trang Facebook/);
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
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
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
  const openedUrl = postUrl + '?comment_id=999';
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
    location: { href: openedUrl },
    scrollY: 100,
    scrollTo(x, y) { this.scrollY = y; }
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
  assert.equal(result.postUrl, postUrl);
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


test('Facebook share permalink is accepted as a post URL for redirect/loading', async () => {
  const listener = loadBridge('https://www.facebook.com/share/p/abc123/');
  const result = await new Promise(resolve => {
    assert.equal(listener({ type: 'COMMENT_CRAWL_COLLECT' }, {}, resolve), true);
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /vùng nội dung trang Facebook/);
  assert.doesNotMatch(result.error, /mở bài viết Facebook ở trang riêng/);
});


test('Facebook bridge retains comments seen before the DOM virtualizes them away', async () => {
  const postUrl = 'https://www.facebook.com/sample.page/posts/777';
  const post = new MockElement('div', { role: 'article', 'aria-label': 'Post by Sample Page', 'data-testid': 'post-container' });
  const firstComment = new MockElement('div', { role: 'article', id: 'comment-701' });
  firstComment.append(
    new MockElement('a', { href: 'https://www.facebook.com/anna' }, 'Anna'),
    new MockElement('div', { dir: 'auto' }, 'First comment visible near the top.'),
    new MockElement('a', { href: postUrl + '?comment_id=701' }, 'Comment permalink'),
    new MockElement('button', {}, 'Reply')
  );
  const secondComment = new MockElement('div', { role: 'article', id: 'comment-702' });
  secondComment.append(
    new MockElement('a', { href: 'https://www.facebook.com/bob' }, 'Bob'),
    new MockElement('div', { dir: 'auto' }, 'Second comment loaded at the bottom.'),
    new MockElement('a', { href: postUrl + '?comment_id=702' }, 'Comment permalink'),
    new MockElement('button', {}, 'Reply')
  );
  post.append(new MockElement('a', { href: postUrl }, 'Post permalink'), firstComment);
  const main = new MockElement('div', { role: 'main' }).append(post);
  const document = {
    title: 'Sample Page post',
    body: main,
    documentElement: { scrollHeight: 2000, clientHeight: 800, scrollTop: 0 },
    querySelector(selector) { return selector === '[role="main"]' || selector === 'main' ? main : null; },
    querySelectorAll(selector) { return main.querySelectorAll(selector); }
  };
  const window = {
    __commentCrawlBridge: false,
    location: { href: postUrl },
    scrollY: 100,
    innerHeight: 800,
    scrollTo(x, y) {
      this.scrollY = y;
      if (y > 0 && post.children.includes(firstComment)) {
        post.children = post.children.filter(child => child !== firstComment);
        firstComment.parentElement = null;
        post.append(secondComment);
      }
    }
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
  assert.ok(result.comments.some(c => c.text === 'First comment visible near the top.'));
  assert.ok(result.comments.some(c => c.text === 'Second comment loaded at the bottom.'));
});


test('Side-panel collection scans comments from multiple posts on the active Facebook feed', async () => {
  const postUrlA = 'https://www.facebook.com/sample.page/posts/810';
  const postUrlB = 'https://www.facebook.com/sample.page/posts/811';
  const postA = new MockElement('div', { role: 'article', 'aria-label': 'Post by Sample Page', 'data-testid': 'post-container' });
  postA.append(
    new MockElement('a', { href: postUrlA }, 'Post A permalink'),
    new MockElement('div', { role: 'article', id: 'comment-8101' }).append(
      new MockElement('a', { href: 'https://www.facebook.com/anna' }, 'Anna'),
      new MockElement('div', { dir: 'auto' }, 'Comment on first feed post.'),
      new MockElement('a', { href: postUrlA + '?comment_id=8101' }, 'Comment permalink'),
      new MockElement('button', {}, 'Reply')
    )
  );
  const postB = new MockElement('div', { role: 'article', 'aria-label': 'Post by Sample Page', 'data-testid': 'post-container' });
  postB.append(
    new MockElement('a', { href: postUrlB }, 'Post B permalink'),
    new MockElement('div', { role: 'article', id: 'comment-8111' }).append(
      new MockElement('a', { href: 'https://www.facebook.com/bob' }, 'Bob'),
      new MockElement('div', { dir: 'auto' }, 'Comment on second feed post.'),
      new MockElement('a', { href: postUrlB + '?comment_id=8111' }, 'Comment permalink'),
      new MockElement('button', {}, 'Reply')
    )
  );
  const main = new MockElement('div', { role: 'main' }).append(postA, postB);
  const document = {
    title: 'Sample Page feed',
    body: main,
    documentElement: { scrollHeight: 200, clientHeight: 800, scrollTop: 0 },
    scrollingElement: null,
    querySelector(selector) { return selector === '[role="main"]' || selector === 'main' ? main : null; },
    querySelectorAll(selector) { return main.querySelectorAll(selector); }
  };
  const window = {
    __commentCrawlBridge: false,
    location: { href: 'https://www.facebook.com/sample.page' },
    scrollY: 0, innerHeight: 800,
    scrollTo(x, y) { this.scrollY = y; document.documentElement.scrollTop = y; }
  };
  const listeners = [];
  const context = {
    window, document, URL, Date, Promise, Array, String, RegExp, Number, Object, Math, WeakMap, WeakSet, Error,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    getComputedStyle() { return { display: 'block', visibility: 'visible', overflowY: 'visible' }; },
    chrome: { runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'facebook-bridge.js'), 'utf8'), context);
  const result = await new Promise(resolve => {
    assert.equal(listeners[0]({ type: 'COMMENT_CRAWL_COLLECT', mode: 'active-page' }, {}, resolve), true);
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.postsScanned, 2);
  assert.equal(result.comments.length, 2);
  assert.ok(result.comments.some(c => c.postUrl === postUrlA && c.text === 'Comment on first feed post.'));
  assert.ok(result.comments.some(c => c.postUrl === postUrlB && c.text === 'Comment on second feed post.'));
});
