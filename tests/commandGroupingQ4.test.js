import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import botinfo from '../src/commands/Core/botinfo.js';
import cases from '../src/commands/Moderation/cases.js';
import ownerstats, { OWNER_OPERATIONS } from '../src/commands/Core/ownerstats.js';
import { BEACON_PALETTE, BEACON_IDENTITY } from '../src/config/beaconIdentity.js';
import botConfig from '../src/config/bot.js';
import { access } from 'node:fs/promises';
import warningLegacy from '../src/commands/Moderation/warnings.js';
import { LEGACY_SLASH_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
import { resolveMovedSlashCommand,searchBeaconCommandsByIntent } from '../src/utils/helpSearch.js';

const sub=(cmd,name)=>cmd.data.toJSON().options.find(option=>option.name===name);
test('info commands share /botinfo and keep all old options',()=>{
 assert.deepEqual(botinfo.data.toJSON().options.map(x=>x.name),
  ['about','status','ping','server','user']);
 assert.deepEqual(sub(botinfo,'server').options.map(x=>x.name),['private']);
 assert.deepEqual(sub(botinfo,'user').options.map(x=>x.name),['target','avatar','private']);
 for(const name of ['userinfo','serverinfo'])assert.ok(LEGACY_SLASH_COMMANDS.has(name));
});
test('case manager takes over warning operations without removing other case actions',()=>{
 assert.deepEqual(cases.data.toJSON().options.map(x=>x.name),
  ['list','view','status','note','evidence','warnings','warn','notes-add','notes-view','notes-remove','notes-clear']);
 assert.equal(sub(cases,'warn').options.find(x=>x.name==='reason').required,true);
 assert.equal(sub(cases,'warnings').options.find(x=>x.name==='target').required,true);
 assert.deepEqual(warningLegacy.data.toJSON().options.map(x=>x.name),['list','add']);
 assert.ok(LEGACY_SLASH_COMMANDS.has('warnings'));
});
test('old names redirect to live operations, not removed top-level commands',()=>{
 for(const [oldName,route] of Object.entries({
  userinfo:'/botinfo user',serverinfo:'/botinfo server',warnings:'/cases warnings',
 })){
  assert.equal(resolveMovedSlashCommand('/'+oldName)?.command,route);
 }
 assert.equal(searchBeaconCommandsByIntent([botinfo,cases], 'warnings')
  .some(x=>x.name==='cases warnings'),true);
});
test('case warning access is restricted even if /cases is discoverable by everyone',async()=>{
 for(const action of ['warn','warnings']){
  let reply=null;
  await cases.execute({
   id:'123456789012345678',
   guildId:'333333333333333333',
   guild:{ownerId:'444444444444444444'},
   user:{id:'555555555555555555'},
   options:{getSubcommand:()=>action},
   memberPermissions:{has:()=>false},
   async reply(payload){reply=payload;},
  },{},{});
  assert.match(reply?.content||'',/Moderate Members permission is required/);
 }
});
test('moderation history stays restricted to View Audit Log for non-warning cases',async()=>{
 let reply=null;
 await cases.execute({
  id:'123456789012345678',guildId:'333333333333333333',
  guild:{ownerId:'444444444444444444'},user:{id:'555555555555555555'},
  options:{getSubcommand:()=> 'list'},memberPermissions:{has:()=>false},
  async reply(payload){reply=payload;},
 },{},{});
 assert.match(reply?.content||'',/View Audit Log permission is required/);
});

// Consolidated command contracts: no data migration, no lost action handlers.
test('owner operations use one creator-only slash command and retain internal handlers',()=>{
 const keys=ownerstats.data.toJSON().options.map(x=>x.name);
 assert.deepEqual(keys,['overview','announcement','giveexp','removeexp','exclude','restore','export']);
 for(const op of ['announcement','giveexp','removeexp','exclude','restore','export'])
  assert.equal(typeof OWNER_OPERATIONS[op].execute,'function');
 assert.equal(sub(ownerstats,'giveexp').options.find(x=>x.name==='amount').required,true);
 for(const name of ['announcement','giveexp','removeexp','removeleaderboard','restoreleaderboard','progressionexport']){
  assert.equal(LEGACY_SLASH_COMMANDS.has(name),false,'old handler must be deleted: '+name);
  assert.match(resolveMovedSlashCommand('/'+name).command,/^\/ownerstats /);
 }
});
test('staff notes live in /cases; unauthorised members never reach saved notes',async()=>{
 for(const name of ['notes-add','notes-view','notes-remove','notes-clear'])
  assert.ok(sub(cases,name),name);
 assert.equal(LEGACY_SLASH_COMMANDS.has('usernotes'),false);
 assert.equal(resolveMovedSlashCommand('/usernotes').command,'/cases notes-view');
 for(const action of ['notes-add','notes-view','notes-remove','notes-clear']){
  let reply=null;
  await cases.execute({
   id:'123456789012345678',guildId:'333333333333333333',
   guild:{ownerId:'444444444444444444'},
   user:{id:'555555555555555555'},
   memberPermissions:{has:()=>false},
   options:{getSubcommand:()=>action},
   async reply(v){reply=v;},
  },{},{});
  assert.match(reply?.content||'',/Manage Messages permission is required/);
 }
});
test('Beacon HQ Network is a presentation layer, not a new slash command',()=>{
 assert.equal(BEACON_IDENTITY.network,'Beacon Network');
 assert.deepEqual(BEACON_IDENTITY.pillars,['Protect','Grow','Reward']);
 assert.equal(botConfig.embeds.colors.primary,BEACON_PALETTE.signal);
 assert.equal(botConfig.embeds.colors.economy,BEACON_PALETTE.gold);
 const value=BEACON_IDENTITY.summary;
 assert.match(value,/community/i);
 assert.ok(!/Network Pulse/i.test(value));
});

test('merged slash command files have been physically deleted, while internal actions remain',async()=>{
 for(const name of ['announcement','giveexp','removeexp','removeleaderboard','restoreleaderboard','progressionexport']){
  await assert.rejects(access('src/commands/Core/'+name+'.js'),{code:'ENOENT'});
  await access('src/commands/Core/modules/ownerActions/'+name+'.js');
 }
 await assert.rejects(access('src/commands/Moderation/usernotes.js'),{code:'ENOENT'});
 await access('src/commands/Moderation/modules/staffNotes.js');
});
