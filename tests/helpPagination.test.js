import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateHelpEntries, splitHelpEntries } from '../src/utils/helpPagination.js';

test('help pages never exceed bounds', () => {
    const entries = Array.from({ length: 53 }, (_, i) => i);
    assert.deepEqual(paginateHelpEntries(entries, -2, 10), { page: 1, totalPages: 6, items: entries.slice(0, 10) });
    assert.deepEqual(paginateHelpEntries(entries, 999, 10), { page: 6, totalPages: 6, items: entries.slice(50) });
    assert.equal(paginateHelpEntries([], 99).totalPages, 1);
});

test('all help commands can be reached across pages', () => {
    const entries = Array.from({ length: 127 }, (_, i) => `command-${i}`);
    const pages = Array.from({ length: 13 }, (_, i) => paginateHelpEntries(entries, i + 1, 10).items).flat();
    assert.deepEqual(pages, entries);
});

test('help fields respect Discord maximum character length', () => {
    const entries = Array.from({ length: 10 }, (_, i) => `${i}: ${'x'.repeat(185)}`);
    const chunks = splitHelpEntries(entries, 900);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every(chunk => chunk.length > 0 && chunk.length <= 900));
    assert.equal(chunks.join('\n'), entries.join('\n'));
});

test('oversized entries are bounded', () => {
    const chunks = splitHelpEntries(['x'.repeat(1500)], 900);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].length, 900);
});
