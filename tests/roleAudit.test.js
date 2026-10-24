import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { auditDangerousRoles } from '../src/utils/roleAudit.js';

const role = (name, flags, overrides = {}) => ({
  id: name, name, position: 1,
  permissions: { has: bit => flags.includes(bit) },
  ...overrides,
});
test('flags administrator, manages high-impact roles, and ignores harmless roles', () => {
  const results = auditDangerousRoles([
    role('messages', [P.ManageMessages]),
    role('simple', []),
    role('admin', [P.Administrator]),
    role('webhooks', [P.ManageWebhooks], { managed: true }),
  ]);
  assert.deepEqual(results.map(item => item.id), ['admin', 'webhooks', 'messages']);
  assert.deepEqual(results.map(item => item.severity), ['critical', 'high', 'review']);
  assert.equal(results[1].managed, true);
});
test('identifies the everyone role without attempting mutation', () => {
  const results = auditDangerousRoles([role('everyone', [P.ManageRoles], { guild: { id: 'everyone' } })]);
  assert.equal(results[0].everyone, true);
});
