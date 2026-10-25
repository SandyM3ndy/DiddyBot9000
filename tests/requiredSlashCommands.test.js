import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_V11_COMMANDS, REQUIRED_GLOBAL_COMMANDS, getMissingRequiredCommands,
  assertRequiredCommandsPresent, registerCommands, registerSandCoinsGuildCommand
} from '../src/handlers/loaders/commandLoader.js';

const appId = '123456789012345678';
const g1 = '987654321098765432', g2 = '876543210987654321';

function mockClient({ guildIds = [g1, g2], failGuild = null } = {}) {
  const calls = [];
  const client = {
    commands: new Map(REQUIRED_V11_COMMANDS.map(name => [
      name, { data: { name, toJSON: () => ({
        name, description: 'Test command',
        ...(name === 'sandcoins' ? { dm_permission: false, options: [{ type: 1, name: 'wallet', description: 'Show your wallet' }] } : {}),
      }) } },
    ])),
    config: { bot: { clientId: appId } },
    guilds: { cache: new Map(guildIds.map(id => [id, { id }])) },
    rest: {
      async put(route, { body }) {
        calls.push({ verb: 'PUT', route, body });
        return body;
      },
      async post(route, { body }) {
        calls.push({ verb: 'POST', route, body });
        if (failGuild && route.includes('/guilds/' + failGuild + '/')) throw Error('Simulated Discord error');
        return { id: '123456789012345679', guild_id: route.split('/guilds/')[1].split('/')[0], name: body.name };
      },
    },
  };
  return { client, calls };
}

test('v1.1 requires Sand Coins locally, but registers other features globally', () => {
  assert.deepEqual(REQUIRED_V11_COMMANDS, ['diagnose', 'roleaudit', 'ticket', 'giveaway', 'time', 'sandcoins']);
  assert.deepEqual(REQUIRED_GLOBAL_COMMANDS, ['diagnose', 'roleaudit', 'ticket', 'giveaway', 'time']);
  assert.deepEqual(getMissingRequiredCommands(['help', 'diagnose', 'roleaudit', 'ticket', 'giveaway']), ['time', 'sandcoins']);
  assert.throws(() => assertRequiredCommandsPresent(['diagnose', 'ticket'], 'loaded'), /roleaudit/);
  assert.doesNotThrow(() => assertRequiredCommandsPresent(REQUIRED_V11_COMMANDS));
});

test('all servers get immediate /sandcoins registration without global duplicates', async () => {
  const { client, calls } = mockClient();
  await registerCommands(client, { clientId: appId });
  const guildCalls = calls.filter(call => call.verb === 'POST');
  assert.deepEqual(guildCalls.map(call => call.route), [
    `/applications/${appId}/guilds/${g1}/commands`,
    `/applications/${appId}/guilds/${g2}/commands`,
  ]);
  for (const call of guildCalls) {
    assert.equal(call.body.name, 'sandcoins');
    assert.equal('dm_permission' in call.body, false);
    assert.equal(call.body.options[0].name, 'wallet');
  }
  const globalCall = calls.at(-1);
  assert.equal(globalCall.verb, 'PUT');
  assert.equal(globalCall.route, `/applications/${appId}/commands`);
  assert.ok(globalCall.body.some(command => command.name === 'giveaway'));
  assert.ok(globalCall.body.every(command => command.name !== 'sandcoins'));
  assert.ok(calls.every(call => !call.route.includes('/guilds/') || call.verb === 'POST'));
});

test('if a guild rejects Sand Coins registration, keep the global fallback', async () => {
  const { client, calls } = mockClient({ failGuild: g2 });
  await registerCommands(client, { clientId: appId });
  const globalCall = calls.at(-1);
  assert.equal(globalCall.verb, 'PUT');
  assert.ok(globalCall.body.some(command => command.name === 'sandcoins'));
});

test('new-guild registration upserts only Sand Coins, never wipes other commands', async () => {
  const { client, calls } = mockClient({ guildIds: [] });
  const result = await registerSandCoinsGuildCommand(client, g1);
  assert.equal(result.name, 'sandcoins');
  assert.deepEqual(calls.map(call => call.verb), ['POST']);
  assert.equal(calls[0].route, `/applications/${appId}/guilds/${g1}/commands`);
});

test('command registration fails when Sand Coins definition is missing', async () => {
  const { client, calls } = mockClient();
  client.commands.delete('sandcoins');
  await assert.rejects(registerCommands(client, { clientId: appId }), /sandcoins/);
  assert.equal(calls.length, 0);
});
