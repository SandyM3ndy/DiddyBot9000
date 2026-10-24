import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_V11_COMMANDS, getMissingRequiredCommands, assertRequiredCommandsPresent } from '../src/handlers/loaders/commandLoader.js';

test('v1.1 required slash commands are never silently skipped', () => {
  assert.deepEqual(REQUIRED_V11_COMMANDS, ['diagnose', 'roleaudit', 'ticket', 'giveaway', 'time']);
  assert.deepEqual(getMissingRequiredCommands(['help', 'diagnose', 'roleaudit', 'ticket', 'giveaway']), ['time']);
  assert.throws(() => assertRequiredCommandsPresent(['diagnose', 'ticket'], 'Discord-registered'), /roleaudit/);
  assert.doesNotThrow(() => assertRequiredCommandsPresent(['help', 'diagnose', 'roleaudit', 'ticket', 'giveaway', 'time']));
});
