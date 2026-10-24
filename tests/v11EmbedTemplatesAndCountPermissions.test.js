import test from 'node:test';
import assert from 'node:assert/strict';
import embedStudio, { applyEmbedTemplate } from '../src/commands/Tools/embedbuilder.js';
import counting from '../src/commands/Fun/count.js';

test('embed studio includes editable templates', () => {
  const state = { title: null, description: null, fields: [] };
  const result = applyEmbedTemplate(state, 'announcement');
  assert.match(result.title, /Announcement/);
  assert.match(result.description, /important update/);
  assert.ok(embedStudio.data.toJSON().options[0].choices.length >= 4);
});

test('counting game public status and leaderboard remain accessible', () => {
  const permissions = counting.data.toJSON().default_member_permissions;
  assert.equal(permissions, undefined);
  for (const name of ['setup', 'disable', 'status', 'reset', 'leaderboard']) {
    assert.ok(counting.data.toJSON().options.some(x => x.name === name));
  }
});
