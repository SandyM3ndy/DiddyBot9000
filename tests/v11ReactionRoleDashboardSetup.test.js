import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReactionRoleLanding, buildReactionRoleSetupModal } from '../src/commands/Reaction_roles/reactionRoleSetup.js';

test('a new server can create its first reaction role panel from dashboard', () => {
  const empty = buildReactionRoleLanding([], { channels: { cache: new Map() } });
  assert.match(empty.embeds[0].toJSON().description, /No panels exist yet/);
  const button = empty.components[0].toJSON().components[0];
  assert.equal(button.custom_id, 'rr_dashboard_create');
  assert.equal(button.label, 'Create First Panel');
});

test('servers with multiple reaction panels can choose one without an error', () => {
  const panels = [
    { messageId: '111111111111111111', channelId: '333333333333333333', roles: ['4'] },
    { messageId: '222222222222222222', channelId: '333333333333333333', roles: ['5'] },
  ];
  const payload = buildReactionRoleLanding(panels, { channels: { cache: new Map() } });
  const select = payload.components[0].toJSON().components[0];
  assert.equal(select.custom_id, 'rr_dashboard_select');
  assert.deepEqual(select.options.map(v => v.value), panels.map(p => p.messageId));
  assert.equal(payload.components[1].toJSON().components[0].custom_id, 'rr_dashboard_create');
});

test('reaction role setup form has title, description, channel and roles', () => {
  const modal = buildReactionRoleSetupModal().toJSON();
  assert.equal(modal.custom_id, 'rr_dashboard_setup');
  assert.equal(modal.components.length, 4);
});

test('reaction role dashboard no longer throws when zero panels exist', async () => {
  const text = await readFile('src/commands/Reaction_roles/reactroles.js', 'utf8');
  const from = text.indexOf('export async function openReactionRoleDashboard(');
  const block = text.slice(from, from + 1900);
  assert.doesNotMatch(block, /'No panels'/);
  assert.match(block, /buildReactionRoleLanding/);
});
