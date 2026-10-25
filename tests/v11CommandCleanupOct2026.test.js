import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { getBeaconInviteUrl } from '../src/commands/Core/invite.js';
import { createInitialHelpMenu } from '../src/commands/Core/help.js';
import { LEGACY_SLASH_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
import random from '../src/commands/Fun/random.js';
import math from '../src/commands/Tools/math.js';
import time from '../src/commands/Tools/time.js';

test('removed /firstmsg source is absent', async () => {
  await assert.rejects(access('src/commands/Utility/firstmsg.js'), { code: 'ENOENT' });
});

test('legacy slash shortcuts are replaced by grouped commands', async () => {
  for (const name of ['flip','roll','countdown','calculate','baseconvert'])
    assert.ok(LEGACY_SLASH_COMMANDS.has(name), name);
  assert.deepEqual(random.data.toJSON().options.map(o=>o.name),['coin','dice']);
  assert.deepEqual(math.data.toJSON().options.map(o=>o.name),['calculate','convert']);
  assert.deepEqual(time.data.toJSON().options.map(o=>o.name),['now','unix','countdown']);
  const dice=random.data.toJSON().options.find(o=>o.name==='dice');
  assert.equal(dice.options.find(o=>o.name==='notation').required,true);
  const convert=math.data.toJSON().options.find(o=>o.name==='convert');
  assert.deepEqual(convert.options.filter(o=>o.type===3).map(o=>o.name),['number','from','to']);
});

test('old invite and greet slash commands are hidden, while welcome dashboard remains',async()=>{
 const loader=await readFile('src/handlers/loaders/commandLoader.js','utf8');
 assert.match(loader,/HIDDEN_COMMANDS = new Set/);
 assert.match(loader,/'invite', 'greet'/);
 const dashboard=await readFile('src/commands/Core/dashboard.js','utf8');
 assert.match(dashboard,/greetDashboard\.execute/);
 assert.match(dashboard,/selected === 'welcome'/);
});

test('help center exposes the existing safe invite URL without Administrator',async()=>{
 const clientId='123456789012345678';
 const client={commands:new Map(),user:{id:clientId,displayAvatarURL:()=>null}};
 const view=await createInitialHelpMenu(client);
 const actions=view.components[0].toJSON().components;
 const invitation=actions.find(b=>b.label==='Invite Beacon');
 assert.ok(invitation);
 assert.equal(invitation.url,getBeaconInviteUrl(clientId));
 assert.ok(view.components[1]===undefined || view.components[1]); // category menu remains optional
});
