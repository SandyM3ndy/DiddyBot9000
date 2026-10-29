import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BEACON_MOTTO, BEACON_FOOTER, formatBeaconFooter, botConfig } from '../src/config/bot.js';
import { createEmbed, successEmbed, buildUserErrorEmbed } from '../src/utils/embeds.js';
import { BEACON_IDENTITY, BEACON_PALETTE } from '../src/config/beaconIdentity.js';
import { buildDispatchBoard,buildDispatchCareerPicker } from '../src/utils/beaconDispatchUi.js';
import { buildStandardLogEmbed } from '../src/utils/logging/logEmbeds.js';

test('Beacon has a single exact official motto and a consistent default footer',()=>{
  assert.equal(BEACON_MOTTO, "Your community's all-in-one Discord assistant.");
  assert.equal(BEACON_FOOTER, 'Beacon • '+BEACON_MOTTO);
  assert.equal(botConfig.embeds.footer.text,BEACON_FOOTER);
  assert.equal(createEmbed({title:'Overview'}).toJSON().footer.text,BEACON_FOOTER);
});

test('contextual Beacon footers preserve helpful text and avoid duplicate labels',()=>{
  assert.equal(formatBeaconFooter('Page 2/4'),'Page 2/4 • Beacon');
  assert.equal(formatBeaconFooter('Beacon • Page 2/4'),'Beacon • Page 2/4');
  assert.equal(formatBeaconFooter(''),BEACON_FOOTER);
  assert.ok(formatBeaconFooter('x'.repeat(2090)).length<=2048);
  assert.equal(createEmbed({title:'Quest',footer:'Quest resets at midnight UTC'}).toJSON().footer.text,
    'Quest resets at midnight UTC • Beacon');
  assert.equal(createEmbed({title:'Quest',footer:{text:'Page 2/4',iconURL:'https://cdn.discordapp.com/embed/avatars/0.png'}}).toJSON().footer.text,
    'Page 2/4 • Beacon');
});

test('success, error and audit embeds cannot become anonymous',()=>{
  assert.equal(successEmbed('Done').toJSON().footer.text,BEACON_FOOTER);
  assert.equal(buildUserErrorEmbed('permission','Restricted').toJSON().footer.text,BEACON_FOOTER);
  const log=buildStandardLogEmbed({color:0x5865F2,title:'A test event'});
  assert.equal(log.toJSON().footer.text,BEACON_FOOTER);
  const custom=buildStandardLogEmbed({color:0x5865F2,title:'A test event',footer:{text:'Action by moderator'}});
  assert.equal(custom.toJSON().footer.text,'Action by moderator • Beacon');
});

test('public flagship commands and website copy use the official motto, not campaign alternatives',async()=>{
  const paths=[
    'src/commands/Core/botinfo.js',
    'src/commands/Core/help.js',
    'src/commands/Core/invite.js',
    'src/commands/Core/support.js',
    'README.md',
  ];
  for(const path of paths){
    const code=await readFile(path,'utf8');
    const escaped=code.replace(/\\'/g,"'");
    assert.ok(escaped.includes(BEACON_MOTTO) || code.includes('BEACON_MOTTO'),path+' should use the official motto or its shared constant');
    assert.doesNotMatch(code,/Your community\. Better protected\./,path);
  }
});

test('owner-approved Beacon slogan remains exact while Network identity is centralised',()=>{
 assert.equal(BEACON_MOTTO,"Your community's all-in-one Discord assistant.");
 assert.equal(BEACON_IDENTITY.network,'Beacon Network');
 assert.deepEqual(BEACON_IDENTITY.pillars,['Protect','Grow','Reward']);
 for(const surface of ['wallet','dispatch','shop','treasury','progression','ranking'])
  assert.match(BEACON_IDENTITY.surfaces[surface],/Beacon/);
 assert.match(BEACON_PALETTE.gold,/^#[0-9A-F]{6}$/i);
 assert.match(BEACON_PALETTE.signal,/^#[0-9A-F]{6}$/i);
 assert.equal(botConfig.presence.activities[0].name,'🌐 Beacon Network | v1.1');
});
test('Beacon identity extends to primary surfaces without new commands or data migration',async()=>{
 const paths=['src/utils/sandEconomyUi.js','src/utils/beaconDispatchUi.js',
  'src/commands/Community/sandcoins.js','src/commands/Community/treasury.js',
  'src/commands/Community/progression.js'];
 for(const path of paths){
  const content=await readFile(path,'utf8');
  assert.match(content,/BEACON_IDENTITY/,path+' should reuse the established identity');
 }
 const ui=await readFile('src/utils/sandEconomyUi.js','utf8');
 assert.match(ui,/displayAvatarURL/,'The wallet should use the installed bot avatar when present');
 const branded=await readFile('src/utils/progressionRankCard.js','utf8');
 assert.match(branded,/approved Beacon logo/,'Default free rank card should reflect brand colours');
});
