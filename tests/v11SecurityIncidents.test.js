import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIncident } from '../src/utils/security/incidentTimeline.js';
import antinuke from '../src/commands/Moderation/antinuke.js';
test('timeline records measured outcomes and bounds unsafe details', () => {
  const incident = normalizeIncident({ action:'Role changed', actorId:'123456789012345678',
    outcome:'kicked', severity:'critical', detail:'@everyone ' + 'x'.repeat(500) }, Date.parse('2026-10-24T10:00:00Z'));
  assert.equal(incident.outcome,'kicked');
  assert.equal(incident.actorId,'123456789012345678');
  assert.ok(incident.detail.length <= 301);
  assert.doesNotMatch(incident.detail, /@everyone/);
});
test('Anti-Nuke exposes its history without a new slash command', () => {
  assert.ok(antinuke.data.toJSON().options.some(x => x.name === 'incidents'));
});
