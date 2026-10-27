import test from 'node:test';
import assert from 'node:assert/strict';
import music from '../src/commands/Music/music.js';
import botinfo from '../src/commands/Core/botinfo.js';
import sandcoins from '../src/commands/Community/sandcoins.js';
import {LEGACY_SLASH_COMMANDS} from '../src/handlers/loaders/commandLoader.js';
import {resolveMovedSlashCommand} from '../src/utils/helpSearch.js';
import {readFile} from 'node:fs/promises';
test('music operations share one slash namespace without losing options',()=>{
 const names=music.data.toJSON().options.map(x=>x.name);
 for(const name of ['play','queue','nowplaying','join','skip','pause','status'])assert.ok(names.includes(name));
 assert.ok(names.length<=25);
 assert.equal(music.data.toJSON().options.find(x=>x.name==='play').options.find(x=>x.name==='query').required,true);
});
test('status, ping and daily claims live in existing feature commands',()=>{
 assert.deepEqual(botinfo.data.toJSON().options.map(x=>x.name),['about','status','ping']);
 assert.ok(sandcoins.data.toJSON().options.some(x=>x.name==='daily'));
 for(const name of ['daily','heist','play','queue','nowplaying','join','ping','status','support'])
  assert.ok(LEGACY_SLASH_COMMANDS.has(name));
});
test('heist panel provides a way back to the Treasury',async()=>{
 const code=await readFile('src/commands/Community/heist.js','utf8');
 assert.match(code,/setCustomId\('treasury:home'\)/);
});

test('retired slash shortcuts point to existing functional destinations',()=>{
 const expected={
  heist:'/treasury',daily:'/sandcoins daily',play:'/music play',
  queue:'/music queue',nowplaying:'/music nowplaying',join:'/music join',
  ping:'/botinfo ping',status:'/botinfo status',support:'/help',
 };
 for(const [oldName,newCommand] of Object.entries(expected)){
  assert.equal(resolveMovedSlashCommand('/'+oldName)?.command,newCommand);
 }
 assert.equal(resolveMovedSlashCommand('/lockdown'),null);
});
