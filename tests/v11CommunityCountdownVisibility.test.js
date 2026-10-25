import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('countdown posts one public editable timer instead of a duplicate receipt',async()=>{
  // The existing timer implementation powers /time countdown.
  const [source,time]=await Promise.all([
    readFile('src/commands/Tools/countdown.js','utf8'),
    readFile('src/commands/Tools/time.js','utf8'),
  ]);
  assert.match(time,/countdownCommand\.execute\(interaction\)/);

  assert.match(source,/const posted = await InteractionHelper\.safeEditReply/);
  assert.match(source,/const message = await interaction\.fetchReply\(\)/);
  assert.doesNotMatch(source,/interaction\.channel\.send\(/);
  assert.doesNotMatch(source,/Countdown started!/);
});
test('staff DM confirmations remain private even while public commands expand',async()=>{
  const source=await readFile('src/commands/Moderation/dm.js','utf8');
  assert.match(source,/safeDefer\(interaction, \{ flags: MessageFlags\.Ephemeral \}\)/);
});
