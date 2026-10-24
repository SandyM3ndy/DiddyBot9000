import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('member join event module can load despite unavailable optional birthday writer', async () => {
  // Real ESM import catches absent named exports (which node --check misses).
  const handler = await import('../src/events/guildMemberAdd.js');
  assert.equal(handler.default.name, 'guildMemberAdd');
  assert.equal(typeof handler.default.execute, 'function');
});

test('member join recovery leaves legacy birthday backups intact without a writer', async () => {
  const source = await readFile('src/events/guildMemberAdd.js', 'utf8');
  assert.match(source, /typeof legacyDatabase\.setBirthday !== 'function'/);
  assert.match(source, /preserved saved backup/);
  assert.match(source, /await legacyDatabase\.setBirthday/);
  // Only remove the archived entry after the optional restore function succeeds.
  const success = source.indexOf('await legacyDatabase.setBirthday');
  const deleteBackup = source.indexOf('delete remaining[user.id]');
  assert.ok(deleteBackup > success);
});
