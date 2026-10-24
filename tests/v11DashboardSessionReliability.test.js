import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('all shared dashboard collectors attach only to their own ephemeral reply', async () => {
  const src = await readFile('src/utils/dashboardSession.js', 'utf8');
  assert.match(src, /replyMessage\.createMessageComponentCollector/);
  assert.doesNotMatch(src, /interaction\.channel\.createMessageComponentCollector/);
  assert.match(src, /componentInteraction\.message\?\.id === replyMessageId/);
  assert.match(src, /refusing to listen to other messages/);
});

test('transcript channel setup blocks public destinations before saving', async () => {
  const src = await readFile('src/commands/Ticket/modules/ticket_dashboard.js', 'utf8');
  const from = src.indexOf('async function handleTranscriptChannel(');
  const to = src.indexOf('async function handleCheckUser(',from);
  const scope = src.slice(from,to);
  assert.ok(scope.indexOf('everyoneView !== false') < scope.indexOf('guildConfig.ticketTranscriptChannelId = channel.id'));
  assert.match(scope,/AttachFiles/);
});
