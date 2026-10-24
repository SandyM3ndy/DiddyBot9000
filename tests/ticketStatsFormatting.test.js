import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTicketCloseTime } from '../src/commands/Ticket/ticketstats.js';

test('ticket stats formats valid and unavailable resolution times', () => {
  assert.equal(formatTicketCloseTime(null), 'Not enough data');
  assert.equal(formatTicketCloseTime(NaN), 'Not enough data');
  assert.equal(formatTicketCloseTime(25_000), 'Under 1 min');
  assert.equal(formatTicketCloseTime(150_000), '3 min');
  assert.equal(formatTicketCloseTime(3_720_000), '1h 2m');
});
