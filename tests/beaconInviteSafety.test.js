import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { BEACON_INSTALL_PERMISSIONS, getBeaconInviteUrl } from '../src/commands/Core/invite.js';

test('Beacon standard invite requests specific permissions and not Administrator',()=>{
  assert.equal((BEACON_INSTALL_PERMISSIONS & PermissionFlagsBits.Administrator),0n);
  assert.notEqual((BEACON_INSTALL_PERMISSIONS & PermissionFlagsBits.SendMessages),0n);
  assert.notEqual((BEACON_INSTALL_PERMISSIONS & PermissionFlagsBits.ManageRoles),0n);
  const url=new URL(getBeaconInviteUrl('123456789012345678'));
  assert.equal(url.origin,'https://discord.com');
  assert.equal(url.pathname,'/oauth2/authorize');
  assert.equal(url.searchParams.get('permissions'),BEACON_INSTALL_PERMISSIONS.toString());
  assert.equal(url.searchParams.get('scope'),'bot applications.commands');
  assert.equal(url.searchParams.get('client_id'),'123456789012345678');
  assert.throws(()=>getBeaconInviteUrl('invalid'),/valid Discord application ID/);
});
