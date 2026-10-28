import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import botinfo from '../src/commands/Core/botinfo.js';
import cases from '../src/commands/Moderation/cases.js';
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
  ['list','view','status','note','evidence','warnings','warn']);
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
