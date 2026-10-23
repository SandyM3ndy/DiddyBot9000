import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { commandAliases, resolveCommandAlias } from '../src/config/commands/commandAliases.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('removed standalone commands stay removed', async () => {
  const removed = [
    'src/commands/Tools/hexcolor.js',
    'src/commands/Utility/avatar.js',
    'src/commands/Core/stats.js',
    'src/commands/Core/uptime.js',
    'src/commands/Tools/poll.js',
  ];
  for (const filename of removed) {
    await assert.rejects(access(path.join(root, filename)), { code: 'ENOENT' }, filename);
  }
});

test('avatar aliases preserve convenient access to userinfo', () => {
  for (const alias of ['avatar', 'pfp', 'icon', 'whois', 'ui']) {
    assert.equal(resolveCommandAlias(alias), 'userinfo');
  }
  assert.equal(resolveCommandAlias('user'), 'userinfo');
  assert.equal(commandAliases['hexcolor'], undefined);
});

test('stats and uptime legacy aliases map to the consolidated commands', () => {
  assert.equal(resolveCommandAlias('stats'), 'botinfo');
  assert.equal(resolveCommandAlias('uptime'), 'status');
});

test('userinfo contains both account information and an avatar option', async () => {
  const content = await source('src/commands/Utility/userinfo.js');
  assert.match(content, /\.setName\('userinfo'\)/);
  assert.match(content, /\.addBooleanOption\(o => o\.setName\('avatar'\)/);
  assert.match(content, /\.setImage\(avatar\)/);
  assert.match(content, /getString|createdAt/);
});

test('merged poll accepts both existing input formats', async () => {
  const content = await source('src/commands/Community/poll.js');
  assert.match(content, /\.setName\('poll'\)/);
  assert.match(content, /joined\.split\('\|'\)/);
  assert.match(content, /option\$\{i\}/);
  assert.match(content, /Promise\.allSettled/);
});

test('new diagnostic, role and suggestion management commands require separate review', async () => {
  const proposed = [
    'src/commands/Core/diagnose.js',
    'src/commands/Moderation/roleaudit.js',
    'src/commands/Community/suggestions.js',
  ];
  // These are still proposed; this test documents that no new slash entry was registered.
  for (const filename of proposed) {
    await assert.rejects(access(path.join(root, filename)), { code: 'ENOENT' }, filename);
  }
});
