import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDashboardEmbed, getDashboardSetupSummary } from '../src/commands/Core/dashboard.js';

test('central control center summarizes missing configuration without claiming real-world readiness', () => {
  const cfg = { prefix: '!', ticketPanelChannelId: '222', setupWizardCompleted: true };
  const summary = getDashboardSetupSummary(cfg);
  assert.equal(summary.configured, 1);
  assert.equal(summary.total, 6);
  assert.ok(summary.missing.some(x => x.name === 'Private archive channel'));
  const embed = buildDashboardEmbed(cfg, { name:'Test Guild', iconURL: () => null, channels: { cache: new Map() }, roles: { cache: new Map() } }).toJSON();
  assert.match(embed.title, /Control Center/);
  assert.match(embed.description, /1\/6 core settings configured/);
  assert.match(embed.description, /Ticket System/);
});

test('the dashboard has refresh, guide and lifecycle timeout controls', async () => {
  const source = await readFile('src/commands/Core/dashboard.js','utf8');
  assert.match(source, /dashboard_refresh:/);
  assert.match(source, /dashboard_guide:/);
  assert.match(source, /componentCollector\.on\('end'/);
  assert.match(source, /No saved settings were changed/);
});
