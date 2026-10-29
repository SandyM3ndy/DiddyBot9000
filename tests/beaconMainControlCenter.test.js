import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardEmbed, buildDashboardRows } from '../src/commands/Core/dashboard.js';
import { buildDashboardHubMenu, buildDashboardHubPanel, DASHBOARD_HUB_SECTIONS } from '../src/utils/dashboardHub.js';
import { BEACON_MOTTO, BEACON_TEAM_NAME, BEACON_TEAM_THANKS } from '../src/config/bot.js';
import { readFile } from 'node:fs/promises';

const gid = '111111111111111111';
const guild = {
  id: gid,
  name: 'Demo Community',
  channels: { cache: new Map([['222222222222222222', {id:'222222222222222222'}]]) },
  roles: { cache: new Map() },
  iconURL: () => null,
};
const config = {
  setupWizardCompleted: true,
  prefix: '!',
  logging: { enabled:true,channels:{audit:'222222222222222222'} },
  serverProgression: { enabled:true },
  ticketPanelChannelId:'222222222222222222',
};

test('/dashboard is explicitly the main Beacon Control Center and preserves existing controls', () => {
  const embed=buildDashboardEmbed(config,guild).toJSON();
  assert.match(embed.title,/Main Control Center/);
  assert.match(embed.description,/Your community's all-in-one Discord assistant/);
  assert.match(JSON.stringify(embed.fields),/From Our Team/);
  assert.match(JSON.stringify(embed.fields),/Ticket|Support/);
  const rows=buildDashboardRows(config,gid,['ticketSystem','logging']);
  assert.equal(rows.length,4);
  assert.ok(rows.length<=5);
  const ids=rows.map(row=>row.toJSON().components[0].custom_id);
  assert.equal(ids[1],'dashboard_select:'+gid);
  assert.equal(ids[2],'dashboard_hub:'+gid);
  assert.equal(ids[3],'dashboard_fave_jump:'+gid);
  const controls=rows[0].toJSON().components.map(b=>b.custom_id);
  assert.ok(controls.includes('dashboard_undo:'+gid));
  assert.ok(controls.includes('dashboard_pin:'+gid));
  assert.ok(controls.includes('dashboard_refresh:'+gid));
});

test('dashboard hub is navigable, read-only and covers genuine Beacon systems',()=>{
  const menu=buildDashboardHubMenu(gid).toJSON().components[0];
  assert.equal(menu.custom_id,'dashboard_hub:'+gid);
  assert.equal(menu.options.length,DASHBOARD_HUB_SECTIONS.length);
  const values=menu.options.map(x=>x.value);
  assert.deepEqual(values,['hubOverview','hubSafety','hubCommunity','hubNetwork','hubSupport','hubTeam']);
  for(const value of values.filter(x=>x!=='hubOverview')){
    const payload=buildDashboardHubPanel(value,config,guild);
    const e=payload.embeds[0].toJSON();
    assert.match(e.footer.text,/Read-only/);
    assert.ok(e.description.length<=4096);
    assert.ok(e.fields.length<=25);
  }
  assert.equal(buildDashboardHubPanel('hubOverview',config,guild),null);
  assert.equal(buildDashboardHubPanel('unknown',config,guild),null);
});

test('Beacon Development Team voice is warm and separate from safety messages',async()=>{
  assert.equal(BEACON_MOTTO,"Your community's all-in-one Discord assistant.");
  assert.equal(BEACON_TEAM_NAME,'The Beacon Development Team');
  assert.match(BEACON_TEAM_THANKS,/Thank you/);
  const team=buildDashboardHubPanel('hubTeam',config,guild);
  assert.match(JSON.stringify(team.embeds[0].toJSON()),/Thank you/);
  assert.match(JSON.stringify(team.embeds[0].toJSON()),/Beacon Development Team/);
  assert.ok(team.components[0].toJSON().components.some(b=>b.style===5));
  for(const file of ['src/commands/Core/support.js','src/commands/Core/invite.js',
    'src/commands/Core/help.js','src/commands/Core/botinfo.js']){
    const source=await readFile(file,'utf8');
    assert.match(source,/BEACON_TEAM_NAME/,file);
  }
  const moderation=await readFile('src/commands/Moderation/ban.js','utf8');
  assert.doesNotMatch(moderation,/BEACON_TEAM_THANKS/);
});

test('the control-center hub is routed through the existing private dashboard collector',async()=>{
  const source=await readFile('src/commands/Core/dashboard.js','utf8');
  assert.match(source,/componentInteraction\.customId === 'dashboard_hub:' \+ interaction\.guildId/);
  assert.match(source,/componentInteraction\.deferUpdate\(\)/);
  assert.match(source,/buildDashboardHubPanel\(selected, current, interaction\.guild\)/);
  assert.match(source,/flags: MessageFlags\.Ephemeral/);
});
