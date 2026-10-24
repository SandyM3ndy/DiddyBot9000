import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('closed tickets allow staff reopening and managers deletion', async () => {
  const code = await readFile('src/utils/ticket/ticketPermissions.js', 'utf8');
  assert.match(code, /canReopenTicket: Boolean\(isClosed && isStaff\)/);
  assert.match(code, /canDeleteTicket: Boolean\(isClosed && \(hasManageChannels \|\| isGuildOwner\)\)/);
  const buttons = await readFile('src/handlers/ticketButtons.js', 'utf8');
  assert.match(buttons, /'reopen tickets', \{ operation: 'reopen' \}/);
  assert.match(buttons, /'delete tickets', \{ operation: 'delete' \}/);
});
test('ticket counts fail closed instead of reporting zero on database errors', async () => {
  const source = await readFile('src/utils/database/tickets.js', 'utf8');
  const count = source.slice(source.indexOf('export async function getOpenTicketCountForUser'), source.indexOf('export async function saveTicketData'));
  assert.doesNotMatch(count, /logger.error[^\n]+[\s\S]*?return 0;/);
  assert.match(count, /Could not verify your existing tickets/);
});
