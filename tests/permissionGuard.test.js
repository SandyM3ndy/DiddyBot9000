import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { getCommandDefaultPermissions, memberMeetsCommandPermissions, memberHasConfiguredModeratorRole } from '../src/utils/permissionGuard.js';

const user = (id, grants = []) => ({
  id,
  guild: { ownerId: 'owner' },
  permissions: { has: perm => grants.includes(perm) },
  roles: { cache: new Map([['staff', true]]) },
});

test('unrestricted commands return null permissions', () => {
  assert.equal(getCommandDefaultPermissions({}), null);
  assert.equal(getCommandDefaultPermissions({ default_member_permissions: null }), null);
});

test('zero permissions are admin-only, not public', () => {
  const restricted = getCommandDefaultPermissions({ default_member_permissions: '0' });
  assert.equal(restricted, 0n);
  assert.equal(memberMeetsCommandPermissions(user('member'), restricted), false);
  assert.equal(memberMeetsCommandPermissions(user('owner'), restricted), true);
  assert.equal(memberMeetsCommandPermissions(user('admin', [PermissionFlagsBits.Administrator]), restricted), true);
  assert.equal(memberMeetsCommandPermissions(user('member'), restricted, { guildConfig: { modRole: 'staff' }, commandCategory: 'moderation' }), false);
});

test('permissions keep enforcing regular command bits', () => {
  const required = getCommandDefaultPermissions({ default_member_permissions: String(PermissionFlagsBits.ManageMessages) });
  assert.equal(memberMeetsCommandPermissions(user('member'), required), false);
  assert.equal(memberMeetsCommandPermissions(user('moderator', [PermissionFlagsBits.ManageMessages]), required), true);
  assert.equal(memberMeetsCommandPermissions(user('member'), required, { guildConfig: { modRole: 'staff' }, commandCategory: 'Moderation' }), true);
});

test('staff role detection supports cached and API member role structures', () => {
  assert.equal(memberHasConfiguredModeratorRole(user('member'), { modRole: 'staff' }), true);
  assert.equal(memberHasConfiguredModeratorRole({ roles: ['staff'] }, { modRole: 'staff' }), true);
  assert.equal(memberHasConfiguredModeratorRole({ roles: [] }, { modRole: 'staff' }), false);
});
