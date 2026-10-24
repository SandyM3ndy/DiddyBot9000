import test from 'node:test';
import assert from 'node:assert/strict';
import dashboard, { buildSettingsSelect } from '../src/commands/Core/dashboard.js';
import { withDashboardHome } from '../src/utils/dashboardHome.js';
test('dashboard search filters settings without losing a clear path',()=>{
  const filtered = buildSettingsSelect('123456789012345678','reaction').toJSON().components[0].options;
  assert.deepEqual(filtered.map(o=>o.value),['reactionRoles']);
  const empty = buildSettingsSelect('123456789012345678','not-a-real-setting').toJSON().components[0].options;
  assert.equal(empty[0].value,'dashboardSearchReset');
  assert.ok(dashboard.data.toJSON().options.some(o=>o.name==='find'));
});
test('home control is idempotent and never exceeds Discord row limit',()=>{
  const once = withDashboardHome([]);
  assert.equal(once[0].toJSON().components[0].custom_id,'beacon_home');
  assert.equal(withDashboardHome(once).length,1);
  assert.equal(withDashboardHome(Array(5).fill(once[0])).length,5);
});
