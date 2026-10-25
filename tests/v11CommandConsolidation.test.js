import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_SLASH_COMMANDS, REQUIRED_V11_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
import giveaway from '../src/commands/Giveaway/giveaway.js';
import ticket from '../src/commands/Ticket/ticket.js';
import time from '../src/commands/Tools/time.js';
import progression from '../src/commands/Community/progression.js';
import warnings from '../src/commands/Moderation/warnings.js';
import random from '../src/commands/Fun/random.js';
import math from '../src/commands/Tools/math.js';

test('streamlined command groups include every migrated operation', () => {
  for (const [command, expected] of [
    [giveaway, ['create', 'end', 'reroll', 'delete']],
    [ticket, ['add', 'remove', 'rename', 'claim', 'close', 'priority', 'stats', 'sla', 'panel', 'my', 'queue', 'info', 'transcript', 'reopen', 'unclaim']],
    [time, ['now', 'unix', 'countdown']],
    [random, ['coin', 'dice']],
    [math, ['calculate', 'convert']],
    [progression, ['overview', 'quests', 'leaderboard', 'rank', 'milestones', 'weekly', 'contributors', 'privacy']],
    [warnings, ['list', 'add']],
  ]) {
    assert.deepEqual(command.data.toJSON().options.map(x => x.name), expected, command.data.name);
  }
});
test('old slash names are retained only as prefix command handlers', () => {
  for (const name of ['gcreate', 'gdelete', 'gend', 'greroll', 'ticketadd', 'ticketstats', 'levels', 'unixtime', 'warn', 'flip', 'roll', 'calculate', 'baseconvert', 'countdown']) {
    assert.ok(LEGACY_SLASH_COMMANDS.has(name), name);
  }
  assert.ok(REQUIRED_V11_COMMANDS.includes('giveaway'));
  assert.ok(REQUIRED_V11_COMMANDS.includes('ticket'));
  assert.equal(LEGACY_SLASH_COMMANDS.has('rank'),false,'/rank card must be registered, not retired');
  assert.ok(REQUIRED_V11_COMMANDS.includes('rank'));
});
