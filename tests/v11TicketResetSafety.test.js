import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('resetting ticket settings never mass-deletes historical tickets', async () => {
  const code = await readFile('src/commands/Ticket/modules/ticket_dashboard.js', 'utf8');
  const start = code.indexOf('async function handleDeleteSystem');
  assert.ok(start !== -1);
  const block = code.slice(start, code.indexOf('const keysToDelete', start) + 2000);
  assert.doesNotMatch(block, /DELETE FROM \$\{pgConfig\.tables\.tickets\}/);
  assert.match(code.slice(start), /getUnarchivedTicketCount/);
  assert.match(code.slice(start), /Reset blocked/);
});
