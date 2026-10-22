import test from 'node:test';
import assert from 'node:assert/strict';
import { pageWarnings } from '../src/utils/moderation/warningPages.js';

const warnings = Array.from({ length: 26 }, (_, i) => ({ id: i + 1 }));
test('warnings have stable numbering across pages', () => {
  assert.deepEqual(pageWarnings(warnings, 1).items.map(x=>x.number), [1,2,3,4,5,6,7,8]);
  assert.deepEqual(pageWarnings(warnings, 4).items.map(x=>x.number), [25,26]);
});
test('warning pages clamp and show all records', () => {
  assert.equal(pageWarnings(warnings, -9).page, 1);
  assert.equal(pageWarnings(warnings, 999).page, 4);
  assert.deepEqual(Array.from({ length: 4 },(_,i)=>pageWarnings(warnings,i+1).items.map(x=>x.warning)).flat(), warnings);
});
test('empty or malformed warning collections are handled', () => {
  assert.deepEqual(pageWarnings(null).items, []);
  assert.equal(pageWarnings([]).totalPages, 1);
});
