import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegisteredCommandCount } from '../src/utils/commandCounts.js';

test('status and about screens report actual slash commands, not legacy handlers', () => {
  const commands = new Map([
    ['live',{data:{name:'live'}}],
    ['legacy',{data:{name:'legacy'},legacyOnly:true}],
    ['ticket',{data:{name:'ticket'}}],
  ]);
  assert.equal(getRegisteredCommandCount({ commands }), 2);
  assert.equal(getRegisteredCommandCount({ commands:new Map() }), 0);
  assert.equal(getRegisteredCommandCount(null), 0);
});
