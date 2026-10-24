import test from 'node:test';
import assert from 'node:assert/strict';
import { isCollectorManagedComponent } from '../src/utils/collectorComponents.js';
import { readFile } from 'node:fs/promises';

test('collector-owned admin controls remain exempt from global missing-handler fallback', () => {
  for (const id of ['rr_edit_text_123', 'rr_delete_123', 'rr_repost_123', 'jtc_config_123',
    'ticket_cfg_edit', 'greet_panel_123', 'dashboard_setup_wizard:123']) {
    assert.equal(isCollectorManagedComponent(id), true, id);
  }
  for (const id of ['ticket_info', 'ticket_transcript', 'ticket_close']) {
    assert.equal(isCollectorManagedComponent(id), false, id);
  }
});

test('reaction-role create button is handled by global loader, not a second collector', async () => {
  const source = await readFile('src/commands/Reaction_roles/reactroles.js', 'utf8');
  const begin = source.indexOf('buttonMatcher: (customId)');
  const end = source.indexOf('onSelect: async', begin);
  assert.doesNotMatch(source.slice(begin, end), /customId === REACTION_ROLE_SETUP_BUTTON/);
  const loader = await readFile('src/handlers/loaders/interactions.js','utf8');
  assert.match(loader, /'rr_dashboard_create'/);
});
