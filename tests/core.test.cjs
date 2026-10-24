'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('default state validates and starts the weekly cursor at zero', () => { const state = C.defaults(); assert.equal(C.valid(state), true); assert.equal(state.settings.weeklyCursor, 0); });
test('post URL validation rejects non-posts and unsafe hosts', () => {
  assert.equal(C.postUrl('https://www.facebook.com/page/posts/123'), true);
  assert.equal(C.postUrl('https://www.facebook.com/share/p/abc123/'), true);
  assert.equal(C.postUrl('https://www.facebook.com/share/v/xyz789/'), true);
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
  assert.match(prompt, /Mức độ tương tác quan sát được/);
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


test('CSV parser auto-detects semicolon and tab delimiters', () => {
  assert.deepEqual(C.parseCsv('Tên Facebook;profileUrl;Mã đối chiếu\r\n"An, Nguyễn";https://www.facebook.com/an;A-01'), [
    ['Tên Facebook', 'profileUrl', 'Mã đối chiếu'],
    ['An, Nguyễn', 'https://www.facebook.com/an', 'A-01']
  ]);
  assert.deepEqual(C.parseCsv('name\tprofileUrl\nAn\thttps://www.facebook.com/an'), [
    ['name', 'profileUrl'],
    ['An', 'https://www.facebook.com/an']
  ]);
});


test('comment filters combine post, date, text and match status safely', () => {
  const comments = [
    { id: 'a', authorName: 'An', text: 'hoa lan', postUrl: 'https://facebook.com/p/posts/1', personId: 'p1', matchStatus: 'matched', commentedAt: '2026-10-23T10:00:00Z', collectedAt: '2026-10-24T00:00:00Z' },
    { id: 'b', authorName: 'Bình', text: 'hoa hồng', postUrl: 'https://facebook.com/p/posts/1', personId: '', matchStatus: 'unmatched', commentedAt: '2026-10-20T10:00:00Z', collectedAt: '2026-10-24T00:00:00Z' },
    { id: 'c', authorName: 'Chi', text: 'hoa cúc', postUrl: 'https://facebook.com/p/posts/2', personId: '', matchStatus: 'ambiguous', commentedAt: '2026-10-23T12:00:00Z', collectedAt: '2026-10-24T00:00:00Z' },
    { id: 'd', authorName: 'Dung', text: 'hoa sen', postUrl: 'https://facebook.com/p/posts/1', personId: '', matchStatus: 'unmatched', commentedAt: '', collectedAt: '2026-10-24T00:00:00Z' }
  ];
  const people = [{ id: 'p1', name: 'An', rosterId: 'A-1' }];
  assert.deepEqual(C.filterComments(comments, { postUrl: 'https://facebook.com/p/posts/1', dateFrom: '2026-10-22', match: 'matched' }, people).map(c => c.id), ['a']);
  assert.deepEqual(C.filterComments(comments, { match: 'unmatched' }, people).map(c => c.id), ['d', 'b']);
  assert.deepEqual(C.filterComments(comments, { match: 'ambiguous', query: 'chi' }, people).map(c => c.id), ['c']);
  assert.deepEqual(C.filterComments(comments, { dateFrom: '2026-10-22' }, people).map(c => c.id), ['c', 'a']);
});


test('roster reconciliation links exact identities and preserves manual decisions', () => {
  const people = [
    { id: 'p1', name: 'An', profileUrl: 'https://www.facebook.com/anna', profileId: 'username:anna', rosterId: 'A1' },
    { id: 'p2', name: 'Bình', profileUrl: 'https://www.facebook.com/binh', profileId: 'username:binh', rosterId: 'B1' },
    { id: 'p3', name: 'Bình', profileUrl: 'https://www.facebook.com/binh', profileId: 'username:binh', rosterId: 'B2' }
  ];
  const comments = [
    { id: 'exact', authorName: 'An', authorProfileUrl: 'https://www.facebook.com/anna', authorProfileId: 'username:anna' },
    { id: 'conflict', authorName: 'An', authorProfileUrl: 'https://www.facebook.com/someone-else', authorProfileId: 'username:someone-else' },
    { id: 'ambiguous', authorName: 'Bình', authorProfileUrl: 'https://www.facebook.com/binh', authorProfileId: 'username:binh' },
    { id: 'manual', authorName: 'Different', personId: 'p2', matchMethod: 'manual', matchStatus: 'manually_matched' },
    { id: 'unlinked', authorName: 'An', personId: '', matchMethod: 'manual_unlink', matchStatus: 'unmatched' }
  ];
  const result = C.reconcileComments(comments, people);
  const byId = Object.fromEntries(result.comments.map(c => [c.id, c]));
  assert.equal(byId.exact.personId, 'p1');
  assert.equal(byId.exact.matchStatus, 'matched');
  assert.equal(byId.conflict.personId, '');
  assert.equal(byId.conflict.matchStatus, 'unmatched');
  assert.equal(byId.ambiguous.matchStatus, 'ambiguous');
  assert.equal(byId.manual.personId, 'p2');
  assert.equal(byId.unlinked.personId, '');
  assert.equal(result.matched, 1);
  assert.equal(result.ambiguous, 1);
});


test('legacy state migration preserves valid history and fills new fields', () => {
  const legacy = {
    trackedPeople: [{ id: 'p1', name: 'An', profileUrl: 'https://www.facebook.com/anna' }],
    comments: [{
      id: 'c1', sourceKey: 'key1', postUrl: 'https://www.facebook.com/page/posts/123',
      authorName: 'An', authorProfileUrl: 'https://www.facebook.com/anna', text: 'Old comment',
      personId: 'p1', parentCommentId: '', depth: 0, collectedAt: '2026-10-20T00:00:00.000Z'
    }],
    reports: [{ id: 'r1', title: 'Saved report', text: 'Keep me', createdAt: '2026-10-21T00:00:00.000Z' }],
    settings: { weeklyDays: 7, lastReportAt: '' },
    logs: []
  };
  const migrated = C.migrateState(legacy);
  assert.equal(C.valid(migrated), true);
  assert.equal(migrated.trackedPeople[0].profileId, 'username:anna');
  assert.equal(migrated.trackedPeople[0].notes, '');
  assert.equal(migrated.comments[0].text, 'Old comment');
  assert.equal(migrated.comments[0].replyCount, 0);
  assert.equal(migrated.comments[0].commentedAt, '');
  assert.equal(migrated.comments[0].personId, 'p1');
  assert.equal(migrated.reports[0].text, 'Keep me');
  assert.equal(migrated.settings.weeklyCursor, 0);
});


test('weekly report cursor advances only by completed profile batches', () => {
  assert.equal(C.advanceWeeklyCursor(45, 0, 9), 9);
  assert.equal(C.advanceWeeklyCursor(45, 30, 3), 33);
  assert.equal(C.advanceWeeklyCursor(45, 33, 12), 0);
  assert.equal(C.advanceWeeklyCursor(0, 0, 3), 0);
});


test('Vietnamese roster column aliases normalize profile IDs and links', () => {
  const headers = ['URL Facebook', 'ID hồ sơ', 'Mã hồ sơ'].map(C.normalizeHeader);
  assert.deepEqual(headers, ['urlfacebook', 'idhoso', 'mahoso']);
});
