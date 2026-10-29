import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,access } from 'node:fs/promises';
import { resolveCommandAlias } from '../src/config/commands/commandAliases.js';

test('decommissioned slash commands cannot accidentally load', async () => {
  const text = await readFile('src/handlers/loaders/commandLoader.js', 'utf8');
  for (const name of ['shorten','generatepassword','randomuser']) {
    assert.ok(text.includes("'" + name + "'"), name);
  }
});
test('old owner-only slash files are absent from the command loader',async()=>{
 for(const name of ['broadcast','popularity','restart'])
  await assert.rejects(access('src/commands/Core/'+name+'.js'),{code:'ENOENT'});
});
test('removed economy and weather aliases no longer claim unsupported features', () => {
  for (const name of ['bal', 'dep', 'gamble', 'pay', 'shop', 'inventory', 'weather']) {
    assert.equal(resolveCommandAlias(name), name);
  }
});
