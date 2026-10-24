import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReactionRolePanelChoices } from '../src/utils/reactionRoles/panelChoices.js';

test('reaction-role autocomplete works when no Discord channel is cached',()=>{
  const panels=[
    {messageId:'111111111111111111',channelId:'222222222222222222',roles:['123']},
    {messageId:'333333333333333333',channelId:'444444444444444444',roles:['456']},
  ];
  const guild={channels:{cache:new Map()}};
  const results=buildReactionRolePanelChoices(panels,guild);
  assert.equal(results.length,2);
  assert.match(results[0].name,/channel not cached/);
  assert.equal(results[0].value,panels[0].messageId);
  assert.equal(buildReactionRolePanelChoices(panels,guild,'333333')[0]?.value,panels[1].messageId);
  assert.deepEqual(panels[0].roles,['123']);
});

test('autocomplete filters malformed records and limits Discord choices',()=>{
  const panels=[{messageId:'bogus'},...Array.from({length:40},(_,i)=>({
    messageId:String(BigInt('111111111111111111')+BigInt(i)),channelId:'123456789012345678'
  }))];
  const results=buildReactionRolePanelChoices(panels);
  assert.equal(results.length,25);
  assert.ok(results.every(x=>x.name.length<=100));
});

test('reaction-role autocomplete is a read-only operation with no deleting or per-panel message fetches',async()=>{
  const code=await readFile('src/events/interactionCreate.js','utf8');
  const start=code.indexOf("interaction.commandName === 'reactroles'");
  const end=code.indexOf("} else if (interaction.isButton())",start);
  const source=code.slice(start,end);
  assert.match(source,/buildReactionRolePanelChoices/);
  assert.doesNotMatch(source,/deleteReactionRoleMessage/);
  assert.doesNotMatch(source,/messages\s*\.\s*fetch/);
});
