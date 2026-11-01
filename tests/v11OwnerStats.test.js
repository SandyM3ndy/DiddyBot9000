import test from 'node:test';
import assert from 'node:assert/strict';
import ownerstats from '../src/commands/Core/bot-owner-dashboard.js';
import { isOwnerOnlyCommand } from '../src/config/commands/commandCategories.js';
import { LEGACY_SLASH_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
test('owner stats replaces popularity without loosening access', () => {
  assert.equal(ownerstats.data.name, 'bot-owner-dashboard');
  assert.ok(isOwnerOnlyCommand('bot-owner-dashboard'));
  assert.equal(LEGACY_SLASH_COMMANDS.has('popularity'),false);
  assert.equal(ownerstats.data.toJSON().options?.length||0,0,'owner actions must use dashboard controls, not subcommands');
  assert.ok(LEGACY_SLASH_COMMANDS.has('goodbye'));
});
