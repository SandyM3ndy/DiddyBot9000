import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { formatDefaultMemberPermissions } from '../src/utils/helpPermissionLabels.js';

test('public and admin-only slash command permissions', () => {
  assert.equal(formatDefaultMemberPermissions(null), 'Everyone');
  assert.equal(formatDefaultMemberPermissions(undefined), 'Everyone');
  assert.equal(formatDefaultMemberPermissions('0'), 'Server administrators');
  assert.equal(formatDefaultMemberPermissions(0n), 'Server administrators');
});
test('required permission bits are combined with AND', () => {
  const flags = PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageMessages;
  const label = formatDefaultMemberPermissions(String(flags));
  assert.match(label, /Manage Channels/);
  assert.match(label, /Manage Messages/);
  assert.match(label, / and /);
  assert.doesNotMatch(label, / or /);
});
test('unknown and malformed permissions are not advertised as unrestricted', () => {
  assert.equal(formatDefaultMemberPermissions('invalid'), 'Restricted');
  assert.match(formatDefaultMemberPermissions(String(1n << 60n)), /other required permissions/);
});
