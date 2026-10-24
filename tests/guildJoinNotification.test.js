import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuildJoinFields } from '../src/utils/guildJoinNotification.js';

test('guild join alert uses real guild stats and formatted creation time', () => {
  const guild = {
    id: '123456789012345678',
    name: 'Example Community',
    ownerId: '999999999999999999',
    memberCount: 1250,
    channels: { cache: { size: 32 } },
    roles: { cache: { size: 18 } },
    premiumSubscriptionCount: 0,
    createdTimestamp: Date.UTC(2024, 0, 1),
  };
  const owner = { id: '999999999999999999', user: { tag: 'ExampleOwner' } };
  const fields = buildGuildJoinFields(guild, owner, 25);
  const byName = Object.fromEntries(fields.map(field => [field.name, field.value]));

  assert.equal(byName.Server, 'Example Community');
  assert.equal(byName['Server ID'], '`123456789012345678`');
  assert.equal(byName['Server Owner'], 'ExampleOwner (`999999999999999999`)');
  assert.equal(byName.Members, '1,250');
  assert.equal(byName.Channels, '32');
  assert.equal(byName.Roles, '18');
  assert.equal(byName['Server Boosts'], '0');
  assert.equal(byName['Server Created'], '<t:1704067200:F>');
  assert.equal(byName['Beacon Server Count'], '25');
});

test('guild join alert handles unavailable counts and owner fetch failures', () => {
  const fields = buildGuildJoinFields({
    id: '123',
    name: 'A'.repeat(1200),
    ownerId: '456',
    memberCount: undefined,
    channels: {},
    roles: {},
    premiumSubscriptionCount: null,
  });
  const byName = Object.fromEntries(fields.map(field => [field.name, field.value]));
  assert.equal(byName.Server.length, 1024);
  assert.equal(byName['Server Owner'], '<@456> (`456`)');
  assert.equal(byName.Members, 'Unavailable');
  assert.equal(byName.Channels, 'Unavailable');
  assert.equal(byName['Server Boosts'], 'Unavailable');
  assert.equal(byName['Server Created'], 'Unavailable');
  assert.equal(byName['Beacon Server Count'], 'Unavailable');
});
