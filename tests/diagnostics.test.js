import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { diagnoseGuild } from '../src/utils/diagnostics.js';

const member = { permissions: { has: () => true }, roles: { highest: { position: 20 } } };
const guild = (channels = {}, roles = {}) => ({
  channels: { cache: { get: key => channels[key] } },
  roles: { cache: { get: key => roles[key] } },
});

test('diagnostics detects missing channel permissions without writing config', () => {
  const config = { ticketPanelChannelId: 'abc' };
  const target = { permissionsFor: () => ({ has: bit => bit !== P.SendMessages }) };
  const result = diagnoseGuild(guild({ abc: target }), config, member);
  assert.ok(result.some(item => item.severity === 'critical' && item.subject === 'Ticket panel'));
  assert.equal(config.ticketPanelChannelId, 'abc');
});

test('uncached channels are reported as unverified, not missing', () => {
  const result = diagnoseGuild(guild(), { ticketPanelChannelId: 'abc' }, member);
  assert.equal(result.find(x => x.subject === 'Ticket panel').severity, 'unverified');
});

test('diagnostics catches role hierarchy problems and null bot membership', () => {
  const result = diagnoseGuild(guild({}, { verify: { position: 22 } }), { verification: { enabled: true, roleId: 'verify' } }, member);
  assert.ok(result.some(item => item.subject === 'Verification role' && item.severity === 'critical'));
  assert.equal(diagnoseGuild(guild(), {}, null)[0].severity, 'critical');
  assert.equal(diagnoseGuild(guild(), {}, member)[0].severity, 'ok');
});
