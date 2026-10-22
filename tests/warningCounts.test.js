import test from 'node:test';
import assert from 'node:assert/strict';
import { countActiveWarnings } from '../src/utils/moderation/warningCounts.js';

test('counts active warnings and excludes deleted records', () => {
  assert.equal(countActiveWarnings([{ id: 1 }, { id: 2, status: 'active' }, { id: 3, status: 'deleted' }]), 2);
});
test('handles empty, corrupt and null warning records safely', () => {
  assert.equal(countActiveWarnings([]), 0);
  assert.equal(countActiveWarnings(null), 0);
  assert.equal(countActiveWarnings('not an array'), 0);
  assert.equal(countActiveWarnings([null, { status: 'deleted' }]), 0);
});
