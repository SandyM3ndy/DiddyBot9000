import test from 'node:test';
import assert from 'node:assert/strict';
import { searchBeaconCommands } from '../src/commands/Core/help.js';

test('command center searches descriptions and ignores retired commands', () => {
  const client = { commands: new Map([
    ['ticket', { data: { name: 'ticket', description: 'Support tickets' }, category: 'Ticket' }],
    ['gcreate', { data: { name: 'gcreate', description: 'Giveaway creation' }, category: 'Giveaway', legacyOnly: true }],
    ['status', { data: { name: 'status', description: 'Bot system health' }, category: 'Core' }],
  ]) };
  assert.deepEqual(searchBeaconCommands(client, 'support').map(x => x.name), ['ticket']);
  assert.deepEqual(searchBeaconCommands(client, 'gcreate').map(x => x.name), []);
  assert.deepEqual(searchBeaconCommands(client, 'health').map(x => x.name), ['status']);
});
