(function () {
  'use strict';
  if (window.__commentCrawlMetaBridge) return;
  window.__commentCrawlMetaBridge = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = element => {
    if (!element || !element.isConnected) return false;
    try {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    } catch (_) { return true; }
  };
  const text = element => String(element && (element.innerText || element.textContent) || '').trim();

  function composer() {
    const elements = Array.from(document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"],[data-lexical-editor="true"]'))
      .filter(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
    return elements.sort((a, b) => score(b) - score(a))[0] || null;
  }
  function score(element) {
    const labels = [element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('data-placeholder')].join(' ').toLowerCase();
    return (element.isContentEditable ? 5 : 0) + (element.getAttribute('role') === 'textbox' ? 3 : 0) +
      (/message|ask|prompt|chat|nhắn|hỏi|trò chuyện/.test(labels) ? 4 : 0) + (element.tagName === 'TEXTAREA' ? 1 : 0);
  }
  function setValue(element, value) {
    element.focus();
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      element.textContent = value;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    } else {
      const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) descriptor.set.call(element, value);
      else element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function responseNodes(box) {
    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="assistant"]',
      'main [dir="auto"]',
      'main p',
      'main li'
    ];
    const nodes = new Set();
    selectors.forEach(selector => {
      Array.from(document.querySelectorAll(selector)).forEach(element => {
        if (element !== box && !(box && box.contains && box.contains(element))) nodes.add(element);
      });
    });
    return Array.from(nodes).filter(visible);
  }
  async function run(message) {
    if (typeof message.prompt !== 'string' || !message.prompt.trim() || message.prompt.length > 19000) {
      return { ok: false, error: 'Prompt phải có từ 1 đến 19.000 ký tự.' };
    }
    const box = composer();
    if (!box) return { ok: false, error: 'Không tìm thấy ô nhập Meta AI. Hãy đăng nhập và mở cuộc trò chuyện Meta AI.' };

    const before = new Map(responseNodes(box).map(element => [element, text(element)]));
    setValue(box, message.prompt.trim());
    await sleep(250);
    const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
    const send = buttons.find(button => {
      const label = ((button.getAttribute('aria-label') || '') + ' ' + text(button)).trim();
      return /^(send|submit|gửi|ask)$/i.test(label) || /send message|gửi tin nhắn/i.test(label);
    });
    if (!send) return { ok: false, error: 'Đã điền prompt nhưng không nhận diện được nút gửi. Không có nội dung nào được gửi.' };

    send.click();
    const start = Date.now();
    let stable = 0, last = '', answer = '';
    while (Date.now() - start < 90000) {
      await sleep(900);
      const candidates = responseNodes(box)
        .map(element => ({ element, value: text(element) }))
        .filter(item => item.value.length > 20 && (!before.has(item.element) || before.get(item.element) !== item.value))
        .map(item => item.value)
        .filter(value => value !== message.prompt.trim());
      const next = candidates.sort((a, b) => b.length - a.length)[0] || '';
      if (next && next === last) stable += 1;
      else stable = 0;
      last = next;
      answer = next;
      if (answer && stable >= 2) return { ok: true, text: answer.slice(0, 20000) };
    }
    if (answer) return { ok: true, text: answer.slice(0, 20000) };
    return { ok: false, error: 'Meta AI chưa trả lời trong thời gian chờ. Kiểm tra tab và thử lại.' };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'COMMENT_CRAWL_META_PROMPT') return false;
    run(message).then(sendResponse).catch(error => sendResponse({
      ok: false, error: String(error && error.message || error).slice(0, 1000)
    }));
    return true;
  });
})();