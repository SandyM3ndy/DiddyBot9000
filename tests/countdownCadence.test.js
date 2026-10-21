import test from 'node:test';
import assert from 'node:assert/strict';
import { getCountdownEditCadence } from '../src/utils/countdownCadence.js';

test('final minute of a countdown updates once per second', () => {
    for (const seconds of [0, 1, 30, 60]) assert.equal(getCountdownEditCadence(seconds), 1000);
});
test('medium countdowns update at most every ten seconds', () => {
    for (const seconds of [61, 120, 1800, 3600]) assert.equal(getCountdownEditCadence(seconds), 10_000);
});
test('hour-plus countdowns reduce Discord message edits', () => {
    for (const seconds of [3601, 86400]) assert.equal(getCountdownEditCadence(seconds), 60_000);
});
