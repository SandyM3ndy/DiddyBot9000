import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { buildBeaconServerInfoEmbed } from '../src/commands/Utility/serverinfo.js';

test('server overview uses real counts and never implies progression is enabled without configuration',()=>{
  const guild={
    id:'111111111111111111',name:'Example Guild',description:'A friendly server',
    ownerId:'555555555555555555',createdTimestamp:Date.UTC(2020,0,1),
    memberCount:50,premiumTier:2,premiumSubscriptionCount:7,
    channels:{cache:new Map([
      ['1',{type:ChannelType.GuildText}],
      ['2',{type:ChannelType.GuildVoice}],
      ['3',{type:ChannelType.GuildForum}],
    ])},
    roles:{cache:new Map([['a',{}],['b',{}]])},
    emojis:{cache:new Map([['a',{}]])},
    features:['COMMUNITY'],iconURL:()=>null,
  };
  const embed=buildBeaconServerInfoEmbed(guild,{}).toJSON();
  const field=(name)=>embed.fields.find(x=>x.name.includes(name))?.value;
  assert.equal(field('Members'),'50');
  assert.equal(field('Text Channels'),'1');
  assert.equal(field('Voice & Stage'),'1');
  assert.equal(field('Forums'),'1');
  assert.equal(field('Roles'),'2');
  assert.match(field('Progression'),/Not enabled/);
  assert.match(buildBeaconServerInfoEmbed(guild,{serverProgression:{enabled:true}}).toJSON().fields.find(x=>x.name.includes('Progression')).value,/Enabled/);
});
