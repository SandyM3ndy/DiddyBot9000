import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuestCatalog, previewDailyQuests, getGlobalProgressionLeaderboard } from '../src/services/serverProgressionService.js';

test('expanded quest catalog has distinct IDs, practical starter challenges and original quests', () => {
  const catalog = getQuestCatalog();
  assert.ok(catalog.length >= 25);
  assert.equal(new Set(catalog.map(quest => quest.id)).size, catalog.length);
  for (const id of ['chatterbox', 'social_butterfly', 'command_centre',
    'channel_hopper', 'busy_server', 'new_faces']) {
    assert.ok(catalog.some(quest => quest.id === id), 'missing original quest ' + id);
  }
  for (const quest of catalog) {
    assert.ok(quest.target >= 1);
    assert.ok(quest.reward >= 1);
    assert.ok(quest.minMembers >= 1);
    assert.ok(['Starter', 'Medium', 'Hard'].includes(quest.difficulty));
  }
});

test('daily quest rotation is stable and suitable for a one-member server', () => {
  const first = previewDailyQuests('12345', '2026-10-24', 1, 1);
  const repeated = previewDailyQuests('12345', '2026-10-24', 1, 1);
  assert.deepEqual(first, repeated);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(quest => quest.id)).size, first.length);
  assert.ok(first.every(quest => quest.minMembers <= 1));
  assert.ok(first.some(quest => quest.difficulty === 'Starter' &&
    ['messages', 'commands'].includes(quest.metric)));
});

test('high-level servers get up to six varied quests without duplicates', () => {
  const catalog = getQuestCatalog();
  for (const [level, count] of [[1, 3], [5, 4], [15, 5], [30, 6]]) {
    const quests = previewDailyQuests('98765', '2026-10-24', level, 250);
    assert.equal(quests.length, count);
    assert.equal(new Set(quests.map(quest => quest.id)).size, count);
    assert.ok(quests.every(quest => catalog.some(entry => entry.id === quest.id)));
  }
});


test('disabled server progression removes a server from world rankings without losing XP', async () => {
  const enabledId = '111111111111111111';
  const toggledId = '222222222222222222';
  const excludedId = '333333333333333333';
  const unconfiguredId = '444444444444444444';
  const guilds = [enabledId, toggledId, excludedId, unconfiguredId];
  const entries = new Map([
    [`guild:${enabledId}:progression`, { xp: 500 }],
    [`guild:${toggledId}:progression`, { xp: 900 }],
    [`guild:${excludedId}:progression`, { xp: 2000, leaderboardExcluded: true }],
    [`guild:${unconfiguredId}:progression`, { xp: 3000 }],
    [`guild:${enabledId}:config`, { serverProgression: { enabled: true } }],
    [`guild:${toggledId}:config`, { serverProgression: { enabled: true } }],
    [`guild:${excludedId}:config`, { serverProgression: { enabled: true } }],
  ]);
  const client = {
    db: {
      list: async prefix => [...entries.keys()].filter(key => key.startsWith(prefix)),
      get: async (key, fallback = null) => entries.get(key) ?? fallback,
    },
    guilds: { cache: new Map(guilds.map(id => [id, { id, name: 'Server ' + id.slice(0, 3) }])) },
  };

  const initial = await getGlobalProgressionLeaderboard(client);
  assert.deepEqual(initial.map(server => server.guildId), [toggledId, enabledId]);

  // Disable progression via the persisted guild flag; the existing XP remains.
  entries.set(`guild:${toggledId}:config`, { serverProgression: { enabled: false } });
  const disabled = await getGlobalProgressionLeaderboard(client);
  assert.deepEqual(disabled.map(server => server.guildId), [enabledId]);
  assert.equal(entries.get(`guild:${toggledId}:progression`).xp, 900);

  // Re-enabling makes the preserved server XP eligible for ranking again.
  entries.set(`guild:${toggledId}:config`, { serverProgression: { enabled: true } });
  const restored = await getGlobalProgressionLeaderboard(client);
  assert.deepEqual(restored.map(server => server.guildId), [toggledId, enabledId]);
  assert.equal(restored[0].xp, 900);
});
