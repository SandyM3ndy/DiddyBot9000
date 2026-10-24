import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPanelEmbed, buildPanelButtonRow } from '../src/commands/Ticket/modules/ticket_dashboard.js';
import { readFile } from 'node:fs/promises';

test('ticket panel respects custom support label and message length safety', () => {
  const row = buildPanelButtonRow({ ticketButtonLabel: 'Contact our team' }).toJSON();
  assert.equal(row.components[0].label, 'Contact our team');
  const rowDefault = buildPanelButtonRow().toJSON();
  assert.equal(rowDefault.components[0].label, 'Get Support');
  const embed = buildPanelEmbed({ ticketPanelMessage: 'a'.repeat(9000) }).toJSON();
  assert.ok(embed.description.length <= 2000);
});
test('ticket panel warns administrators if archive is publicly viewable', async () => {
  const source = await readFile('src/commands/Ticket/modules/ticket_dashboard.js','utf8');
  assert.match(source, /Transcript archive visible to @everyone/);
  assert.match(source, /PermissionFlagsBits.ViewChannel/);
});
test('welcome dashboard surfaces missing delivery-channel configuration', async () => {
  const source = await readFile('src/commands/Welcome/modules/greet_dashboard.js','utf8');
  assert.match(source, /Set a welcome channel to deliver welcome messages/);
  assert.match(source, /Set a goodbye channel to deliver goodbye messages/);
});
