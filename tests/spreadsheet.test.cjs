'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sheet = require('../spreadsheet.js');

test('XLSX export creates a workbook ZIP with multiple sheets', async () => {
  const blob = Sheet.create([
    { name: 'BinhLuan', rows: [['Tên', 'Bình luận'], ['An', '=1+1']] },
    { name: 'HoSo', rows: [['Tên', 'Trạng thái'], ['An', 'Đã ghép']] }
  ]);
  assert.match(blob.type, /spreadsheetml\.sheet/);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.ok(bytes.length > 1000);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const raw = new TextDecoder().decode(bytes);
  assert.match(raw, /xl\/workbook\.xml/);
  assert.match(raw, /BinhLuan/);
  assert.match(raw, /HoSo/);
  assert.match(raw, /t="inlineStr"/);
  assert.doesNotMatch(raw, /<f>/);
});


test('XLSX export strips XML-invalid control characters', async () => {
  const blob = Sheet.create([{ name: 'Control', rows: [['before\u0000after']] }]);
  const raw = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
  assert.doesNotMatch(raw, /before\u0000after/);
  assert.match(raw, /beforeafter/);
});


test('long reports split into Excel-safe cell lengths without losing text', () => {
  const input = 'report-data-'.repeat(7000);
  const chunks = Sheet.splitText(input, 30000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 30000));
  assert.equal(chunks.join(''), input);
});
