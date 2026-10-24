import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatusEmbed } from '../src/commands/Moderation/antinuke.js';
test('anti-nuke displays a readable security center status with incident counts', () => {
  const embed = buildStatusEmbed({ enabled: true, level: 'medium', threats: 4, blockedActions: 2 }).toJSON();
  assert.match(embed.title, /Security Control Center/);
  assert.ok(embed.fields.some(field => field.value === '4'));
  assert.match(embed.description, /online/);
});
