import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_ONLY_COMMANDS, PROTECTED_COMMANDS, isOwnerOnlyCommand, getCategoryIcon, formatCategoryName } from '../src/config/commands/commandCategories.js';
import { isPrimaryBotOwner } from '../src/config/bot.js';
import { isCommandEnabledInConfig } from '../src/services/commandAccessService.js';

test('restricted commands are labeled, protected and grouped', () => {
  const names = ['announcement','broadcast','giveexp','removeexp','removeleaderboard','restoreleaderboard','popularity','ownerstats','restart'];
  assert.equal(OWNER_ONLY_COMMANDS.size, names.length);
  for (const name of names) {
    assert.equal(isOwnerOnlyCommand(name), true, name);
    assert.equal(PROTECTED_COMMANDS.has(name), true, name);
    assert.equal(isCommandEnabledInConfig({ disabledCommands: { [name]: true }, disabledCategories: { botowner: true } }, name, 'BotOwner'), true);
  }
  assert.equal(isOwnerOnlyCommand('status'), false);
  assert.equal(formatCategoryName('BotOwner'), 'Bot Owner');
  assert.equal(getCategoryIcon('BotOwner'), '👑');
});

test('only the configured primary owner can access restricted commands', () => {
  assert.equal(isPrimaryBotOwner('1022691434974957618'), true);
  assert.equal(isPrimaryBotOwner('other'), false);
  assert.equal(isPrimaryBotOwner(null), false);
});
