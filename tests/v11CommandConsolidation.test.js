import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SLASH_COMMANDS, REQUIRED_V11_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
import giveaway from '../src/commands/Giveaway/giveaway.js';
import ticket from '../src/commands/Ticket/ticket.js';
import time from '../src/commands/Tools/time.js';
import progression from '../src/commands/Community/progression.js';
import warnings from '../src/commands/Moderation/warnings.js';

test('streamlined command groups include every migrated operation', () => {
  for (const [command, expected] of [
    [giveaway, ['create', 'end', 'reroll', 'delete']],
    [ticket, ['add', 'remove', 'rename', 'claim', 'close', 'priority', 'stats', 'sla', 'panel', 'my', 'queue', 'info', 'transcript', 'reopen', 'unclaim']],
    [time, ['now', 'unix']],
    [progression, ['overview', 'quests', 'leaderboard', 'rank', 'milestones']],
    [warnings, ['list', 'add']],
  ]) {
    assert.deepEqual(command.data.toJSON().options.map(x => x.name), expected, command.data.name);
  }
});
test('old slash names are retained only as prefix command handlers', () => {
  for (const name of ['gcreate', 'gdelete', 'gend', 'greroll', 'ticketadd', 'ticketstats', 'rank', 'levels', 'unixtime', 'warn']) {
    assert.ok(LEGACY_SLASH_COMMANDS.has(name), name);
  }
  assert.ok(REQUIRED_V11_COMMANDS.includes('giveaway'));
  assert.ok(REQUIRED_V11_COMMANDS.includes('ticket'));
});
