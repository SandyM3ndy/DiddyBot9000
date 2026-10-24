import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTicketTranscriptHtml } from '../src/utils/ticket/ticketTranscriptHtml.js';
import { withTicketCreationLock, buildTicketControlRows } from '../src/services/ticket.js';
import { buildPanelButtonRow, buildPanelEmbed } from '../src/commands/Ticket/modules/ticket_dashboard.js';
import { readFile } from 'node:fs/promises';

test('transcript escapes malicious HTML and records attachments safely', () => {
  const html = buildTicketTranscriptHtml({
    channelName: '<important>',
    guildName: 'Example & Sons',
    generatedAt: '2026-10-24T10:00:00Z',
    messages: [
      { createdTimestamp: Date.parse('2026-10-24T09:00:00Z'),
        author: { tag: '<admin>' }, content: '<script>alert("x")</script>',
        embeds: [{ title: 'Announcement', description: '<img src=x onerror=alert(1)>' }],
        attachments: new Map([['1', { name: 'report.pdf', url: 'https://cdn.discordapp.com/attachments/1/2/report.pdf' }]]) },
      { createdTimestamp: Date.parse('2026-10-24T09:01:00Z'),
        author: { tag: 'member' }, content: 'hello',
        attachments: new Map([['bad', { name: 'unsafe', url: 'javascript:alert(1)' }]]) },
    ],
  });
  assert.match(html, /Beacon Ticket Archive/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /report\.pdf/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /Example &amp; Sons/);
});

test('ticket creation lock serializes repeated submissions by the same requester', async () => {
  const progress = [];
  const first = withTicketCreationLock('guild', 'user', async () => {
    progress.push('first-start');
    await new Promise(resolve => setTimeout(resolve, 25));
    progress.push('first-end');
  });
  const second = withTicketCreationLock('guild', 'user', async () => {
    progress.push('second-start');
    progress.push('second-end');
  });
  await Promise.all([first, second]);
  assert.deepEqual(progress, ['first-start','first-end','second-start','second-end']);
});

test('failed user ticket operations do not poison the creation queue', async () => {
  await assert.rejects(withTicketCreationLock('guild2', 'user2', () => { throw new Error('failed'); }), /failed/);
  assert.equal(await withTicketCreationLock('guild2', 'user2', async () => 'recovered'), 'recovered');
});

test('ticket controls fit Discord limits and include staff and requester actions', () => {
  const unclaimed = buildTicketControlRows({ enablePriority: true });
  assert.equal(unclaimed.length, 2);
  assert.ok(unclaimed.every(row => row.components.length <= 5));
  const ids = unclaimed[0].components.map(x => x.data.custom_id);
  assert.ok(ids.includes('ticket_claim'));
  assert.ok(ids.includes('ticket_info'));
  assert.ok(ids.includes('ticket_close'));
  assert.equal(unclaimed[1].components.length, 4);
  assert.ok(buildTicketControlRows({ claimedBy: '123' })[0].components.some(x => x.data.custom_id === 'ticket_unclaim'));
});

test('public support panel offers categories and a personal ticket portal', () => {
  const row = buildPanelButtonRow().toJSON();
  assert.equal(row.components.length, 5);
  assert.ok(row.components.some(x => x.custom_id === 'ticket_my'));
  const embed = buildPanelEmbed().toJSON();
  assert.match(embed.title, /Support Center/);
  assert.match(embed.description, /private conversation/);
});

test('ticket deletion requires transcript archival before channel deletion', async () => {
  const source = await readFile('src/services/ticket.js', 'utf8');
  const begin = source.indexOf('export async function deleteTicket(');
  const block = source.slice(begin, source.indexOf('export async function unclaimTicket(', begin));
  assert.ok(block.indexOf('archiveChannel.send') < block.indexOf('await channel.delete('));
  assert.match(block, /not been deleted/);
  assert.match(block, /ticketTranscriptChannelId/);
});
