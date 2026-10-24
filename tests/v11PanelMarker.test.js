import test from 'node:test';
import assert from 'node:assert/strict';
import { messageHasButtonCustomId } from '../src/utils/panelStatus.js';

test('ticket panel discovery recognizes typed request buttons and legacy create button', () => {
  const message = id => ({ components: [{ type: 1, components: [{ type: 2, custom_id: id }] }] });
  assert.equal(messageHasButtonCustomId(message('create_ticket'), 'create_ticket'), true);
  assert.equal(messageHasButtonCustomId(message('create_ticket:support'), 'create_ticket'), true);
  assert.equal(messageHasButtonCustomId(message('create_ticket:bug'), 'create_ticket'), true);
  assert.equal(messageHasButtonCustomId(message('create_ticket_attack'), 'create_ticket'), false);
  assert.equal(messageHasButtonCustomId(message('ticket_my'), 'create_ticket'), false);
});
