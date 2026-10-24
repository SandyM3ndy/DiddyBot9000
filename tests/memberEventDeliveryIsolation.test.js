import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('goodbye delivery permission failures do not abandon the member-leave pipeline', async () => {
  const code = await readFile('src/events/guildMemberRemove.js','utf8');
  const start = code.indexOf('const goodbyeChannelId =');
  const end = code.indexOf('await logEvent({', start);
  assert.ok(start >= 0 && end > start);
  const section = code.slice(start,end);
  assert.doesNotMatch(section,/\breturn\s*;/,
    'a missing goodbye channel permission must not skip counters or logging');
  assert.match(section,/Goodbye delivery failed; continuing member-leave processing/);
});

test('welcome delivery failures do not abandon roles, verification or audit logging', async () => {
  const code = await readFile('src/events/guildMemberAdd.js','utf8');
  const start = code.indexOf('if (welcomeConfig?.enabled && welcomeChannelId)');
  const end = code.indexOf('if (welcomeConfig?.roleIds',start);
  assert.ok(start >= 0 && end > start);
  assert.match(code.slice(start,end),
    /Welcome delivery failed; continuing member-join processing/);
  assert.match(code.slice(end),/handleVerification\(/);
  assert.match(code.slice(end),/await logEvent\(/);
});
