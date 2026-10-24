import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { replyUserError, ErrorTypes } from '../src/utils/errorHandler.js';

test('a deferred component dashboard error uses a private follow-up, not an edit to the panel', async () => {
  let edited = 0;
  const sent = [];
  const interaction = {
    id: '123456789012345678', guildId: '123456789012345679',
    user: { id: '123456789012345670' },
    deferred: true, replied: false, ephemeral: null,
    isMessageComponent: () => true,
    createdTimestamp: Date.now(),
    editReply: async () => { edited++; },
    followUp: async payload => { sent.push(payload); },
  };
  await replyUserError(interaction, {
    type: ErrorTypes.CONFIGURATION,
    message: 'The settings panel could not load.',
  });
  assert.equal(edited, 0, 'must never overwrite a public component message');
  assert.equal(sent.length, 1);
  assert.ok(sent[0].flags, 'error follow-up must be private');
});

test('a deferred private slash-command error still edits the private response', async () => {
  let edited = 0,followed = 0;
  const interaction = {
    id: '123456789012345681', guildId: '123456789012345679',
    user: { id: '123456789012345670' },
    deferred: true, replied: false, ephemeral: true,
    isMessageComponent: () => false,
    createdTimestamp: Date.now(),
    editReply: async () => { edited++; },
    followUp: async () => { followed++; },
  };
  await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Unable to load settings.' });
  assert.equal(edited, 1);
  assert.equal(followed, 0);
});

test('ticket controls acknowledge interactions before reading permissions', async () => {
  const source = await readFile('src/handlers/ticketButtons.js', 'utf8');
  for (const permission of ['claim tickets','change ticket priority','pin tickets','unclaim tickets','reopen tickets']) {
    const needle = "await assertTicketPermission(interaction, client, '"+permission+"'";
    const position = source.indexOf(needle);
    assert.ok(position>0,permission);
    const nearby = source.slice(Math.max(0,position-230),position);
    assert.match(nearby,/safeDefer\(interaction,\s*\{ flags: MessageFlags\.Ephemeral \}\)/,permission);
  }
});

test('reaction-role and main dashboards preserve state on recoverable errors', async () => {
  const dashboard = await readFile('src/commands/Core/dashboard.js','utf8');
  const marker = dashboard.indexOf("logger.error('Dashboard interaction error:', error)");
  assert.ok(marker>=0);
  assert.match(dashboard.slice(marker,marker+750),/componentInteraction\.followUp/);
  assert.doesNotMatch(dashboard.slice(marker,marker+750),/components:\s*\[\]/);
  const source = await readFile('src/services/reactionRoleService.js','utf8');
  assert.match(source,/Reaction-role panel storage read failed/);
  assert.match(source,/Existing panels were not changed/);
});

test('ticket close and delete confirmation acknowledge before database permission work',async()=>{
 const source=await readFile('src/handlers/ticketButtons.js','utf8');
 for(const [start,end,permission] of [
   ['const closeTicketModalHandler = {','const claimTicketHandler = {','close this ticket'],
   ['const deleteTicketHandler = {','const deleteTicketConfirmHandler = {','permanently delete tickets'],
   ['const deleteTicketConfirmHandler = {','const deleteTicketCancelHandler = {','delete the ticket'],
 ]){
   const begin=source.indexOf(start),finish=source.indexOf(end,begin+start.length);
   assert.ok(begin>=0 && finish>begin,start);
   const body=source.slice(begin,finish);
   const permissionIndex=body.indexOf("await assertTicketPermission(interaction, client, '"+permission+"'");
   const deferIndex=body.indexOf('InteractionHelper.safeDefer(interaction');
   assert.ok(deferIndex>=0 && permissionIndex>deferIndex,start+' must acknowledge before storage work');
 }
});
