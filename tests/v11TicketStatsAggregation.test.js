import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGuildTickets } from '../src/utils/database/tickets.js';

test('ticket analytics include claim timing without mislabeling first replies', () => {
  const rows = [
    { status: 'open', createdAt: '2026-10-24T10:00:00Z', claimedAt: '2026-10-24T10:10:00Z', claimedBy: 'staff1' },
    { status: 'open', createdAt: '2026-10-24T10:00:00Z', claimedBy: null },
    { status: 'closed', createdAt: '2026-10-24T10:00:00Z', closedAt: '2026-10-24T11:00:00Z',
      claimedAt: '2026-10-24T10:20:00Z', claimedBy: 'staff1', feedback: { rating: 5 } },
  ];
  const result = summarizeGuildTickets(rows);
  assert.equal(result.openCount, 2);
  assert.equal(result.closedCount, 1);
  assert.equal(result.claimedCount, 2);
  assert.equal(result.unclaimedOpenCount, 1);
  assert.equal(result.avgClaimTimeMs, 900_000);
  assert.equal(result.avgCloseTimeMs, 3_600_000);
  assert.deepEqual(result.topClaimers, [{ userId: 'staff1', tickets: 2 }]);
});
test('empty ticket records report unavailable averages', () => {
  const result = summarizeGuildTickets([]);
  assert.equal(result.avgClaimTimeMs, null);
  assert.equal(result.avgCloseTimeMs, null);
});
