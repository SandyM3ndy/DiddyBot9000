import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard acknowledges navigation selections before doing I/O', async () => {
  const source = await readFile('src/commands/Core/dashboard.js', 'utf8');
  for (const choice of ['commandAccess', 'logging', 'welcome', 'ticketSystem', 'joinToCreate']) {
    const at = source.indexOf("if (selected === '" + choice + "'");
    assert.ok(at >= 0, choice);
    assert.match(source.slice(at, at + 230), /deferUpdate\(\)/, choice);
  }
});

test('global button router never drops unrecognized controls without responding', async () => {
  const code = await readFile('src/events/interactionCreate.js', 'utf8');
  const begin = code.indexOf('const button = client.buttons.get(customId)');
  const end = code.indexOf("} else if (interaction.isStringSelectMenu())", begin);
  const block = code.slice(begin, end);
  assert.doesNotMatch(block, /!interaction\.customId\.includes\(':'\)/);
  assert.match(block, /isCollectorManagedComponent\(customId\)/);
});

test('loader requires transcript and info controls at startup', async () => {
  const source = await readFile('src/handlers/loaders/interactions.js', 'utf8');
  assert.match(source, /'ticket_info', 'ticket_transcript'/);
  assert.match(source, /Required Beacon interface buttons failed to register/);
});
