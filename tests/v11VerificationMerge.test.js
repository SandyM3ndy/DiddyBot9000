import test from 'node:test';
import assert from 'node:assert/strict';
import verification from '../src/commands/Verification/verification.js';
import { LEGACY_SLASH_COMMANDS } from '../src/handlers/loaders/commandLoader.js';

test('verification unifies manual and automatic verification settings', () => {
  const names = verification.data.toJSON().options.map(item => item.name);
  for (const name of ['setup', 'remove', 'dashboard', 'auto-setup', 'auto-dashboard']) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(LEGACY_SLASH_COMMANDS.has('autoverify'));
});
