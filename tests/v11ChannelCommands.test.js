import test from 'node:test';
import assert from 'node:assert/strict';
import channel from '../src/commands/Moderation/channel.js';
import { LEGACY_SLASH_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
test('channel lock and unlock are grouped without impacting emergency lockdown', () => {
  assert.deepEqual(channel.data.toJSON().options.map(x => x.name), ['lock','unlock']);
  assert.ok(LEGACY_SLASH_COMMANDS.has('lock'));
  assert.ok(LEGACY_SLASH_COMMANDS.has('unlock'));
  assert.equal(channel.data.toJSON().default_member_permissions, '16');
});
