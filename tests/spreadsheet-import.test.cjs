'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sheet = require('../spreadsheet.js');

class MiniNode {
  constructor(name, attrs) { this.tagName = name; this.attrs = attrs || {}; this.children = []; this.directText = ''; }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  getAttributeNS(_namespace, name) { return this.getAttribute('r:' + name) || this.getAttribute(name); }
  get textContent() { return this.directText + this.children.map(child => child.textContent).join(''); }
  getElementsByTagName(name) {
    const result = [];
    for (const child of this.children) {
      if (child.tagName === name) result.push(child);
      result.push(...child.getElementsByTagName(name));
    }
    return result;
  }
}
class MiniDOMParser {
  parseFromString(source) {
    const document = new MiniNode('#document');
    const stack = [document];
    const tokens = String(source).match(/<[^>]+>|[^<]+/g) || [];
    for (const token of tokens) {
      if (token.startsWith('<?') || token.startsWith('<!')) continue;
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([A-Za-z0-9_:.-]+)/);
        if (!tag) continue;
        const attrs = {};
        const attrText = token.slice(tag[0].length, token.length - (token.endsWith('/>') ? 2 : 1));
        for (const match of attrText.matchAll(/([A-Za-z0-9_:.-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
        const node = new MiniNode(tag[1], attrs);
        stack[stack.length - 1].children.push(node);
        if (!token.endsWith('/>')) stack.push(node);
      } else {
        const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        stack[stack.length - 1].directText += decode(token);
      }
    }
    return document;
  }
}

test('XLSX import reads first worksheet rows and keeps cells as text', async () => {
  const original = global.DOMParser;
  global.DOMParser = MiniDOMParser;
  try {
    const blob = Sheet.create([
      { name: 'Roster', rows: [['Tên Facebook', 'profileUrl', 'Mã đối chiếu'], ['Nguyễn An', 'https://www.facebook.com/nguyenan', 'A-01'], ['Bình', '', 'A-02']] },
      { name: 'Ignored', rows: [['other'], ['not read']] }
    ]);
    const rows = await Sheet.readXlsx(blob);
    assert.deepEqual(rows, [
      ['Tên Facebook', 'profileUrl', 'Mã đối chiếu'],
      ['Nguyễn An', 'https://www.facebook.com/nguyenan', 'A-01'],
      ['Bình', '', 'A-02']
    ]);
  } finally {
    if (original === undefined) delete global.DOMParser;
    else global.DOMParser = original;
  }
});
