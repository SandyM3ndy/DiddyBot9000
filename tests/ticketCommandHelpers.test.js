import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicketChannelName, protectedTicketParticipant } from '../src/utils/ticket/ticketCommandHelpers.js';

test('ticket names are safe, trimmed and bounded', () => {
  assert.equal(normalizeTicketChannelName('  My Help Room!! '), 'my-help-room');
  assert.equal(normalizeTicketChannelName('HELLO    WORLD'), 'hello-world');
  assert.equal(normalizeTicketChannelName('🔒💬'), '');
  assert.equal(normalizeTicketChannelName('A'.repeat(100)).length, 80);
  assert.equal(normalizeTicketChannelName(null), '');
});

test('ticket creator, bot and guild owner stay protected', () => {
  const roles = { creatorId: '1', ownerId: '2', botId: '3' };
  for (const id of ['1', '2', '3']) assert.equal(protectedTicketParticipant(id, roles), true);
  assert.equal(protectedTicketParticipant('4', roles), false);
  assert.equal(protectedTicketParticipant('', roles), false);
});
