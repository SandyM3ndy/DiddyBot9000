import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_V11_COMMANDS, getMissingRequiredCommands, assertRequiredCommandsPresent, registerCommands } from '../src/handlers/loaders/commandLoader.js';

test('v1.1 required slash commands are never silently skipped', () => {
  assert.deepEqual(REQUIRED_V11_COMMANDS, ['diagnose', 'roleaudit', 'ticket', 'giveaway', 'time', 'sandcoins']);
  assert.deepEqual(getMissingRequiredCommands(['help', 'diagnose', 'roleaudit', 'ticket', 'giveaway']), ['time', 'sandcoins']);
  assert.throws(() => assertRequiredCommandsPresent(['diagnose', 'ticket'], 'Discord-registered'), /roleaudit/);
  assert.doesNotThrow(() => assertRequiredCommandsPresent(['help', 'diagnose', 'roleaudit', 'ticket', 'giveaway', 'time', 'sandcoins']));
});

test('global startup registers Sand Coins without deleting server-scoped commands', async () => {
  const clientId = '123456789012345678';
  const calls = [];
  const client = {
    commands: new Map(REQUIRED_V11_COMMANDS.map(name => [
      name, { data: { name, toJSON: () => ({ name, description: 'Test command' }) } },
    ])),
    config: { bot: { clientId } },
    guilds: { cache: new Map([['987654321098765432', { id: '987654321098765432' }]]) },
    rest: {
      async put(route, { body }) {
        calls.push({ route, body });
        return body;
      },
    },
  };
  const oldSetting = process.env.BEACON_CLEAN_LEGACY_GUILD_COMMANDS;
  delete process.env.BEACON_CLEAN_LEGACY_GUILD_COMMANDS;
  try {
    await registerCommands(client, { clientId });
  } finally {
    if (oldSetting === undefined) delete process.env.BEACON_CLEAN_LEGACY_GUILD_COMMANDS;
    else process.env.BEACON_CLEAN_LEGACY_GUILD_COMMANDS = oldSetting;
  }
  assert.deepEqual(calls.map(call => call.route), [`/applications/${clientId}/commands`]);
  assert.ok(calls[0].body.some(command => command.name === 'sandcoins'));
});
