import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { MessageFlags } from 'discord.js';
import ownerstats from '../src/commands/Core/ownerstats.js';
import botConfig from '../src/config/bot.js';
import { OWNER_ACTIONS,buildOwnerDashboard,buildOwnerGuildList,buildOwnerRestartConfirmation } from '../src/commands/Core/modules/ownerDashboardUi.js';
import {
 OWNER_OPERATIONS,selectOwnerAction,ownerDashboardSelect,ownerDashboardButton,
 ownerDashboardModal,withOwnerActionOptions,
} from '../src/commands/Core/modules/ownerDashboardActions.js';
import { isOwnerOnlyCommand } from '../src/config/commands/commandCategories.js';
import { resolveMovedSlashCommand } from '../src/utils/helpSearch.js';

const owner=botConfig.commands.primaryOwnerId,guest='444444444444444444';
const guilds=new Map([['12345678901234567',{name:'Demo Server',id:'12345678901234567',memberCount:25,
 channels:{cache:new Map()},roles:{cache:new Map()}}]]);
const client={guilds:{cache:guilds},commands:new Map()};
function fake(uid=owner){
 let response,modal;
 const i={
  id:'987654321098765432',user:{id:uid},client,
  get last(){return response;},get modal(){return modal;},
  async reply(v){response=v;return v;},
  async update(v){response=v;return v;},
  async showModal(v){modal=v;return v;},
 };
 return i;
}
test('only /ownerstats stays as an owner-only slash command, with NO subcommands',async()=>{
 const schema=ownerstats.data.toJSON();
 assert.equal(schema.name,'ownerstats');
 assert.ok(!schema.options?.length);
 assert.ok(isOwnerOnlyCommand('ownerstats'));
 for(const old of ['restart','popularity','broadcast','announcement','giveexp','removeexp',
  'removeleaderboard','restoreleaderboard','progressionexport']){
  assert.notEqual(old,schema.name);
  assert.ok(!isOwnerOnlyCommand(old),'obsolete owner slash name must not have a registered command');
  assert.equal(resolveMovedSlashCommand('/'+old).command,'/ownerstats');
 }
 for(const file of ['restart','popularity','broadcast'])
  await assert.rejects(access('src/commands/Core/'+file+'.js'),{code:'ENOENT'});
});
test('owner dashboard has ONE eight-action menu, not eight subcommands',()=>{
 const screen=buildOwnerDashboard(client);
 assert.equal(screen.embeds.length,1);
 assert.equal(screen.components.length,2);
 const ids=screen.components[1].toJSON().components[0].options.map(x=>x.value);
 assert.deepEqual(ids,Object.keys(OWNER_ACTIONS));
 assert.ok(ids.includes('restart')&&ids.includes('export'));
 assert.match(screen.embeds[0].toJSON().title,/Bot Owner Dashboard/);
 const page=buildOwnerGuildList(client);
 assert.match(page.embeds[0].toJSON().description,/Demo Server/);
});
test('non-owners cannot open dashboard, use a menu, press buttons or submit forms',async()=>{
 const a=fake(guest);await ownerstats.execute(a);
 assert.match(a.last.content,/primary Beacon owner/);
 const b=fake(guest);await ownerDashboardSelect({...b,values:['giveexp']});
 assert.match(b.last?.content||'',/Bot Owner Dashboard/);
 const c=fake(guest);await ownerDashboardButton(c,['restart-confirm']);
 assert.match(c.last.content,/Bot Owner Dashboard/);
 const d=fake(guest);d.fields={getTextInputValue:()=>''};
 await ownerDashboardModal(d,['giveexp',owner]);
 assert.match(d.last.content,/Bot Owner Dashboard/);
});
test('owner selects an XP action through a modal, not a slash subcommand',async()=>{
 const i=fake();
 await selectOwnerAction(i,'giveexp');
 assert.ok(i.modal);
 const json=i.modal.toJSON();
 assert.equal(json.custom_id,'owner_form:giveexp:'+owner);
 const ids=json.components.map(r=>r.components[0].custom_id);
 assert.deepEqual(ids,['server_id','amount']);
 for(const action of ['removeexp','exclude','restore','announcement']){
  const m=fake();await selectOwnerAction(m,action);assert.ok(m.modal);
 }
});
test('restart choice is only a confirmation prompt, not an immediate restart',async()=>{
 const i=fake();
 await selectOwnerAction(i,'restart');
 assert.match(i.last.embeds[0].toJSON().title,/Confirm|Restart/);
 const buttons=i.last.components[0].toJSON().components;
 assert.ok(buttons.some(b=>b.custom_id==='owner_action:restart-confirm'));
 assert.ok(buttons.some(b=>b.custom_id==='owner_action:home'));
 const cancel=fake();
 await ownerDashboardButton(cancel,['home']);
 assert.match(cancel.last.embeds[0].toJSON().title,/Owner Dashboard/);
});
test('owner forms validate server IDs and amounts before touching the database',async()=>{
 const i=fake();i.fields={getTextInputValue:key=>key==='server_id'?'wrong':'500'};
 await ownerDashboardModal(i,['giveexp',owner]);
 assert.match(i.last.content,/valid 17–20 digit Discord server ID/);
 const j=fake();j.fields={getTextInputValue:key=>key==='server_id'?'123456789012345678':'-10'};
 await ownerDashboardModal(j,['removeexp',owner]);
 assert.match(j.last.content,/XP amount must be/);
});
test('modals cannot be replayed by a different owner ID',async()=>{
 const i=fake();i.fields={getTextInputValue:()=>''};
 await ownerDashboardModal(i,['giveexp',guest]);
 assert.match(i.last.content,/Bot Owner Dashboard/);
});
test('legacy feature handlers still work as internal actions; no data is migrated',()=>{
 for(const k of ['announcement','giveexp','removeexp','exclude','restore','export','restart'])
  assert.equal(typeof OWNER_OPERATIONS[k]?.execute,'function',k);
 const i=fake();
 const adapter=withOwnerActionOptions(i,{server_id:'123456789012345678',amount:'100'});
 assert.equal(adapter.options.getString('server_id',true),'123456789012345678');
 assert.equal(adapter.options.getInteger('amount',true),100);
 assert.equal(adapter.client,client);
});
