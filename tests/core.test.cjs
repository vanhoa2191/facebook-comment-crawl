'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('default state validates', () => assert.equal(C.valid(C.defaults()), true));
test('post URL validation rejects non-posts and unsafe hosts', () => {
  assert.equal(C.postUrl('https://www.facebook.com/page/posts/123'), true);
  assert.equal(C.postUrl('https://www.facebook.com/'), false);
  assert.equal(C.postUrl('https://evil.example/page/posts/123'), false);
});
test('identity matching prefers URL then unique name', () => {
  const people = [
    { id: '1', name: 'Nguyễn An', profileUrl: 'https://www.facebook.com/an', profileId: 'username:an' },
    { id: '2', name: 'Bình', profileUrl: '', profileId: '' }
  ];
  assert.equal(C.matchPerson(people, { name: 'Different', profileUrl: 'https://facebook.com/an' }).personId, '1');
  assert.equal(C.matchPerson(people, { name: ' bình ' }).personId, '2');
});
test('ambiguous same-name records are not auto-merged', () => {
  const people = [{ id: '1', name: 'An', profileUrl: '' }, { id: '2', name: 'An', profileUrl: '' }];
  assert.equal(C.matchPerson(people, { name: 'An' }).status, 'ambiguous');
});
test('CSV parser handles quotes and embedded commas', () => {
  assert.deepEqual(C.parseCsv('name,url\r\n"An, A","https://facebook.com/an"'), [['name', 'url'], ['An, A', 'https://facebook.com/an']]);
});
test('CSV export protects formula injection', () => assert.match(C.csv([['=1+1']]), /'=1\+1/));
test('analysis prompt compares time windows and forbids sensitive inference', () => {
  const person = { id: 'p1', name: 'An' };
  const comments = [
    { id: 'old', personId: 'p1', text: 'chủ đề trước', commentedAt: '2026-10-10T00:00:00Z', permalink: 'https://facebook.com/p/posts/1' },
    { id: 'new', personId: 'p1', text: 'new', commentedAt: '2026-10-23T00:00:00Z', permalink: 'https://facebook.com/p/posts/2' }
  ];
  const prompt = C.analysisPrompt(person, comments, 7, Date.parse('2026-10-24T00:00:00Z'));
  assert.match(prompt, /Giai đoạn trước/);
  assert.match(prompt, /Giai đoạn gần đây/);
  assert.match(prompt, /Không suy đoán thuộc tính nhạy cảm/);
  assert.match(prompt, /new/);
  assert.doesNotMatch(prompt, /chủ đề trước/);
});
