'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('default state validates and starts the weekly cursor at zero', () => { const state = C.defaults(); assert.equal(C.valid(state), true); assert.equal(state.settings.weeklyCursor, 0); });
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
  assert.match(prompt, /dữ liệu không đáng tin cậy/);
  assert.match(prompt, /new/);
  assert.match(prompt, /chủ đề trước/);
});


test('a matching name does not override a different known profile URL', () => {
  const people = [{ id: 'old', name: 'An', profileUrl: 'https://www.facebook.com/oldname', profileId: 'username:oldname' }];
  const result = C.matchPerson(people, { name: 'An', profileUrl: 'https://www.facebook.com/newname' });
  assert.equal(result.status, 'unmatched');
  assert.equal(result.personId, '');
});


test('comments without an original timestamp are excluded from time trends', () => {
  const person = { id: 'p1', name: 'An' };
  const comments = [
    { id: 'timed', personId: 'p1', text: 'known date', commentedAt: '2026-10-23T00:00:00Z', collectedAt: '2026-10-23T00:00:00Z', permalink: 'https://facebook.com/p/posts/2' },
    { id: 'untimed', personId: 'p1', text: 'unknown date', commentedAt: '', collectedAt: '2026-10-23T00:00:00Z', permalink: 'https://facebook.com/p/posts/3' }
  ];
  const prompt = C.analysisPrompt(person, comments, 7, Date.parse('2026-10-24T00:00:00Z'));
  assert.match(prompt, /1 bình luận không có thời gian gốc/);
  assert.match(prompt, /known date/);
  assert.doesNotMatch(prompt, /unknown date/);
});


test('Vietnamese roster headers normalize accents and separators', () => {
  assert.equal(C.normalizeHeader('Tên Facebook'), 'tenfacebook');
  assert.equal(C.normalizeHeader('Mã đối chiếu'), 'madoichieu');
  assert.equal(C.normalizeHeader('Profile_URL'), 'profileurl');
});


test('state validation rejects unsafe profile and comment links', () => {
  const state = C.defaults();
  state.trackedPeople.push({ id: 'p1', name: 'An', profileUrl: 'https://evil.example/an', profileId: '', rosterId: '', notes: '' });
  assert.equal(C.valid(state), false);
});


test('state validation accepts a complete multi-batch report larger than one prompt', () => {
  const state = C.defaults();
  state.reports.push({ id: 'r1', title: 'Weekly', text: 'x'.repeat(50000), createdAt: '2026-10-24T00:00:00.000Z' });
  assert.equal(C.valid(state), true);
});
