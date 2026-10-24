'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadBridge(options) {
  const opts = options || {};
  const listeners = [];
  const assistantMessages = [];
  let sentPrompt = '';
  const textareaPrototype = {};
  Object.defineProperty(textareaPrototype, 'value', {
    get() { return this._value || ''; },
    set(value) { this._value = value; }
  });
  const composer = Object.create(textareaPrototype);
  Object.assign(composer, {
    tagName: 'TEXTAREA', isConnected: true, disabled: false, isContentEditable: false,
    getAttribute(name) { return ({ placeholder: 'Ask Meta AI', role: 'textbox', 'aria-label': 'Message Meta AI' })[name] || null; },
    getClientRects() { return [1]; }, focus() {}, dispatchEvent() { return true; }
  });
  const sendButton = {
    isConnected: true, disabled: false,
    getAttribute(name) { return ({ 'aria-label': opts.sendLabel || 'Send' })[name] || null; },
    getClientRects() { return [1]; },
    click() {
      sentPrompt = composer.value;
      if (opts.response !== false) assistantMessages.push({
        isConnected: true,
        innerText: 'This is a complete Meta AI response for the requested analysis.',
        textContent: 'This is a complete Meta AI response for the requested analysis.',
        getClientRects() { return [1]; }
      });
    }
  };
  const document = {
    querySelectorAll(selector) {
      if (selector.startsWith('textarea, [contenteditable')) return opts.composer === false ? [] : [composer];
      if (selector.startsWith('main [data-message-author-role') || selector.startsWith('[data-message-author-role')) return assistantMessages;
      if (selector === 'button,[role="button"]') return opts.sendButton === false ? [] : [sendButton];
      if (selector.startsWith('[data-message-author-role="assistant"]')) return assistantMessages;
      return [];
    }
  };
  const chrome = { runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } } };
  function FakeEvent() {}
  function FakeInputEvent() {}
  function HTMLTextAreaElement() {}
  HTMLTextAreaElement.prototype = textareaPrototype;
  function HTMLInputElement() {}
  HTMLInputElement.prototype = {};
  const context = {
    window: { __commentCrawlMetaBridge: false }, document, chrome,
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
    Event: FakeEvent, InputEvent: FakeInputEvent, HTMLTextAreaElement, HTMLInputElement,
    Date, URL, Array, String, RegExp, Error, Promise, Set, Object,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'meta-ai-bridge.js'), 'utf8'), context);
  return { listener: listeners[0], composer, getSentPrompt: () => sentPrompt };
}

test('Meta AI Web bridge sends through the visible composer and reads the answer', async () => {
  const bridge = loadBridge();
  const response = await new Promise(resolve => {
    assert.equal(bridge.listener({ type: 'COMMENT_CRAWL_META_PROMPT', prompt: 'Summarize these comments.' }, {}, resolve), true);
  });
  assert.equal(response.ok, true);
  assert.match(response.text, /complete Meta AI response/);
  assert.match(bridge.getSentPrompt(), /Summarize these comments/);
});

test('Meta AI Web bridge rejects requests when the composer or send button is missing', async () => {
  const noComposer = loadBridge({ composer: false });
  const first = await new Promise(resolve => noComposer.listener({ type: 'COMMENT_CRAWL_META_PROMPT', prompt: 'Hello' }, {}, resolve));
  assert.equal(first.ok, false);
  assert.match(first.error, /Không tìm thấy ô nhập/);
  const noSend = loadBridge({ sendButton: false });
  const second = await new Promise(resolve => noSend.listener({ type: 'COMMENT_CRAWL_META_PROMPT', prompt: 'Hello' }, {}, resolve));
  assert.equal(second.ok, false);
  assert.match(second.error, /không nhận diện được nút gửi/);
});

test('Meta AI Web bridge rejects empty or oversized prompts', async () => {
  const bridge = loadBridge();
  const empty = await new Promise(resolve => bridge.listener({ type: 'COMMENT_CRAWL_META_PROMPT', prompt: ' ' }, {}, resolve));
  assert.equal(empty.ok, false);
  const large = await new Promise(resolve => bridge.listener({ type: 'COMMENT_CRAWL_META_PROMPT', prompt: 'x'.repeat(19001) }, {}, resolve));
  assert.equal(large.ok, false);
});
