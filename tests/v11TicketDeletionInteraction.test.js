import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { InteractionHelper } from '../src/utils/interactionHelper.js';
import ticketButtons from '../src/interactions/buttons/ticket/ticket.js';

test('deletion confirms archive before deleting channel, never responds after deletion', async () => {
  const service = await readFile('src/services/ticket.js', 'utf8');
  const start = service.indexOf('export async function deleteTicket(');
  const end = service.indexOf('export async function unclaimTicket(', start);
  const body = service.slice(start, end);
  assert.ok(body.indexOf('await onArchived(') < body.indexOf('await channel.delete('));
  const handlers = await readFile('src/handlers/ticketButtons.js', 'utf8');
  const from = handlers.indexOf('const deleteTicketConfirmHandler = {');
  const to = handlers.indexOf('const deleteTicketCancelHandler = {', from);
  const confirm = handlers.slice(from, to);
  assert.match(confirm, /onArchived: async/);
  assert.ok(confirm.indexOf('safeEditReply(interaction') < confirm.indexOf('// The channel is gone.'));
  assert.doesNotMatch(confirm.slice(confirm.indexOf('// The channel is gone.')), /interaction\.(editReply|followUp)\(/);
});

test('deleted channel skips follow-up after Discord 10008 edit error', async () => {
  let followUps = 0;
  const interaction = {
    id: 'interaction-1', user: { id: 'mod-1' }, deferred: true,
    guild: { channels: { cache: new Map() } }, channelId: 'deleted-channel',
    async editReply() { throw Object.assign(new Error('Unknown Message'), { code: 10008 }); },
    async followUp() { followUps++; },
  };
  assert.equal(await InteractionHelper.safeEditReply(interaction, { content: 'Deleted' }), false);
  assert.equal(followUps, 0);
});

test('missing original reply and failed follow-up return false without throwing', async () => {
  let followUps = 0;
  const interaction = {
    id: 'interaction-2', user: { id: 'mod-2' }, deferred: true,
    guild: { channels: { cache: new Map([['still-here', true]]) } }, channelId: 'still-here',
    async editReply() { throw Object.assign(new Error('Unknown Message'), { code: 10008 }); },
    async followUp() { followUps++; throw Object.assign(new Error('Unknown Message'), { code: 10008 }); },
  };
  assert.equal(await InteractionHelper.safeEditReply(interaction, { content: 'Deleted' }), false);
  assert.equal(followUps, 1);
});

test('ticket info and transcript buttons are registered and actionable', () => {
  for (const name of ['ticket_info', 'ticket_transcript', 'ticket_delete_confirm', 'ticket_delete_cancel']) {
    assert.ok(ticketButtons.some(handler => handler.name === name), name);
  }
});
