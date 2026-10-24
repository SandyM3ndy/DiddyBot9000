import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateServerHealth } from '../src/utils/diagnostics.js';

test('diagnose uses transparent advisory health weighting', () => {
  assert.deepEqual(calculateServerHealth([]).score, 100);
  const health = calculateServerHealth([
    {severity:'critical',subject:'Transcript privacy',detail:'Public'},
    {severity:'warning',subject:'Ticket routing',detail:'Missing'},
    {severity:'unverified',subject:'Welcome',detail:'Uncached'},
  ]);
  assert.equal(health.score,73);
  assert.equal(health.grade,'Needs attention');
  assert.equal(health.actions.length,2);
});
