import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BEACON_MOTTO, BEACON_FOOTER, formatBeaconFooter, botConfig } from '../src/config/bot.js';
import { createEmbed, successEmbed, buildUserErrorEmbed } from '../src/utils/embeds.js';
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
