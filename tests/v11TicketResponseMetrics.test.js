import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGuildTickets } from '../src/utils/database/tickets.js';

test('first response is recorded separately from claim timing', () => {
  const t = summarizeGuildTickets([
    { status:'open',createdAt:'2026-10-24T10:00:00Z',claimedAt:'2026-10-24T10:02:00Z',
      claimedBy:'staff',firstResponseAt:'2026-10-24T10:05:00Z' },
    { status:'open',createdAt:'2026-10-24T11:00:00Z' },
  ]);
  assert.equal(t.avgClaimTimeMs, 120_000);
  assert.equal(t.avgFirstResponseMs, 300_000);
  assert.equal(t.unansweredOpenCount, 1);
  assert.equal(t.respondedCount, 1);
});
