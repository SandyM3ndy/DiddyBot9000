import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { MessageFlags } from 'discord.js';
import ownerButton from '../src/interactions/buttons/ownerDashboard.js';
import ownerSelect from '../src/interactions/selectMenus/ownerDashboard.js';
import ownerModal from '../src/interactions/modals/ownerDashboard.js';
import { isBotOwner } from '../src/config/bot.js';
import ownerstats from '../src/commands/Core/bot-owner-dashboard.js';
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
  async deferReply(){i.deferred=true;return true;},
  async editReply(v){response=v;return v;},
 };
 return i;
}
test('only /bot-owner-dashboard stays as an owner-only slash command, with NO subcommands',async()=>{
 const schema=ownerstats.data.toJSON();
 assert.equal(schema.name,'bot-owner-dashboard');
 assert.ok(!schema.options?.length);
 assert.ok(isOwnerOnlyCommand('bot-owner-dashboard'));
 for(const old of ['restart','popularity','broadcast','announcement','giveexp','removeexp',
  'removeleaderboard','restoreleaderboard','progressionexport']){
  assert.notEqual(old,schema.name);
  assert.ok(!isOwnerOnlyCommand(old),'obsolete owner slash name must not have a registered command');
  assert.equal(resolveMovedSlashCommand('/'+old).command,'/bot-owner-dashboard');
 }
 for(const file of ['restart','popularity','broadcast'])
  await assert.rejects(access('src/commands/Core/'+file+'.js'),{code:'ENOENT'});
});
test('owner dashboard has ONE eight-action menu, not eight subcommands',()=>{
 const screen=buildOwnerDashboard(client);
 assert.equal(screen.embeds.length,1);
 assert.equal(screen.components.length,3);
 const ids=screen.components[2].toJSON().components[0].options.map(x=>x.value);
 assert.deepEqual(ids,Object.keys(OWNER_ACTIONS));
 assert.ok(ids.includes('restart')&&ids.includes('export'));
 assert.match(screen.embeds[0].toJSON().title,/Bot Owner Dashboard/);
 const page=buildOwnerGuildList(client);
 assert.match(page.embeds[0].toJSON().description,/Demo Server/);
});
test('non-owners cannot open dashboard, use a menu, press buttons or submit forms',async()=>{
 const a=fake(guest);await ownerstats.execute(a);
 assert.match(a.last.content,/configured Beacon bot owners/);
 const b=fake(guest);b.values=['giveexp'];await ownerDashboardSelect(b);
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


test('Connected Servers never sends duplicate custom IDs on 0, 1, 8, 12, 13, 24 or 25 servers',async()=>{
 for(const count of [0,1,8,12,13,24,25]){
  const serverCache=new Map(Array.from({length:count},(_,n)=>{
   const id=String(100000000000000000n+BigInt(n));
   return [id,{id,name:'Test Guild '+String(n).padStart(2,'0')}];
  }));
  const c={guilds:{cache:serverCache}};
  const pages=Math.max(1,Math.ceil(count/12));
  for(let page=0;page<pages;page++){
   const view=buildOwnerGuildList(c,page);
   const embed=view.embeds[0].toJSON();
   assert.match(embed.title,/Connected Beacon Servers/);
   assert.equal(view.components.length,pages===1?1:2,'No arrows on a one-page list');
   const buttons=view.components.flatMap(row=>row.toJSON().components);
   const ids=buttons.map(b=>b.custom_id);
   assert.equal(new Set(ids).size,ids.length,'Duplicate Discord component custom ID at '+count+' servers, page '+page);
   assert.ok(ids.every(id=>id.length<=100));
   assert.ok(ids.includes('owner_action:home'));
   if(pages>1){
    const prev=buttons.find(b=>b.label==='Previous'),next=buttons.find(b=>b.label==='Next');
    assert.equal(prev.disabled,page===0);
    assert.equal(next.disabled,page===pages-1);
    assert.match(prev.custom_id,/:previous$/);
    assert.match(next.custom_id,/:next$/);
   }
  }
 }
});

test('Connected Servers navigation works through the owner button handler',async()=>{
 const c={guilds:{cache:new Map(Array.from({length:13},(_,n)=>{
  const id=String(100000000000000000n+BigInt(n));
  return [id,{id,name:'Guild '+String(n).padStart(2,'0')}];
 }))},commands:new Map()};
 const screen=fake();
 screen.client=c;
 await ownerDashboardButton(screen,['guilds','1','next']);
 assert.match(screen.last.embeds[0].toJSON().footer.text,/Page 2 of 2/);
 const ids=screen.last.components.flatMap(row=>row.toJSON().components).map(x=>x.custom_id);
 assert.equal(ids.length,new Set(ids).size);
 await ownerDashboardButton(screen,['guilds','0','previous']);
 assert.match(screen.last.embeds[0].toJSON().footer.text,/Page 1 of 2/);
});

test('Bot Owner Dashboard uses the same (interaction, client, args) signature as Discord events',async()=>{
 const section=fake();await ownerButton.execute(section,client,['announcements']);
 assert.match(section.last.embeds[0].toJSON().description,/Compose Announcement/);
 assert.ok(section.last.components[1].toJSON().components.some(b=>b.custom_id==='owner_action:open:announcement'));
 const compose=fake();await ownerButton.execute(compose,client,['open','announcement']);
 assert.equal(compose.modal.toJSON().custom_id,'owner_form:announcement:'+owner);
 const selector=fake();selector.values=['announcement'];
 await ownerSelect.execute(selector,client,['choose']);
 assert.equal(selector.modal.toJSON().custom_id,'owner_form:announcement:'+owner);
 const connected=fake();await ownerButton.execute(connected,client,['open','guilds']);
 assert.match(connected.last.embeds[0].toJSON().title,/Connected Beacon Servers/);
 const progression=fake();await ownerButton.execute(progression,client,['progression']);
 assert.ok(progression.last.components[1].toJSON().components.some(b=>b.custom_id==='owner_action:open:giveexp'));
 const maintenance=fake();await ownerButton.execute(maintenance,client,['maintenance']);
 assert.ok(maintenance.last.components[1].toJSON().components.some(b=>b.custom_id==='owner_action:open:restart'));
 const confirm=fake();await ownerButton.execute(confirm,client,['open','restart']);
 assert.match(confirm.last.embeds[0].toJSON().title,/Restart Beacon/);
});
test('Announcement drafts are previewed privately; confirm sends once, replay is harmless',async()=>{
 const i=fake();i.fields={getTextInputValue:key=>({
  title:'Beacon Major Update',message:'Dispatch, Sand Coins and Treasury Wars are here!',
 })[key]};
 await ownerModal.execute(i,client,['announcement',owner]);
 assert.match(i.last.embeds[0].toJSON().title,/Review Beacon Announcement/);
 assert.match(i.last.embeds[0].toJSON().description,/NOT SENT/);
 assert.equal(i.last.flags,MessageFlags.Ephemeral);
 const buttons=i.last.components[0].toJSON().components;
 const confirm=buttons.find(b=>b.label==='Confirm Broadcast');
 assert.ok(confirm?.custom_id.startsWith('owner_action:announce-confirm:'+owner+':'));
 assert.ok(buttons.some(b=>b.label==='Edit'));
 assert.ok(buttons.some(b=>b.label==='Cancel'));
 const send=fake();
 await ownerButton.execute(send,client,confirm.custom_id.split(':').slice(1));
 assert.match(send.last.embeds[0].toJSON().title,/Broadcast Complete/);
 assert.match(send.last.embeds[0].toJSON().description,/Sent:\*\* 0/);
 const stale=fake();
 await ownerButton.execute(stale,client,confirm.custom_id.split(':').slice(1));
 assert.match(stale.last.embeds[0].toJSON().description,/expired or was replaced/);
});
test('Announcement edit prefills the form, cancel discards, and old confirm is rejected',async()=>{
 const compose=fake();
 compose.fields={getTextInputValue:key=>({
  title:'Original',message:'Original message',
 })[key]};
 await ownerModal.execute(compose,client,['announcement',owner]);
 const btns=compose.last.components[0].toJSON().components;
 const edit=btns.find(b=>b.label==='Edit').custom_id;
 const confirm=btns.find(b=>b.label==='Confirm Broadcast').custom_id;
 const editing=fake();
 await ownerButton.execute(editing,client,edit.split(':').slice(1));
 assert.equal(editing.modal.toJSON().components[0].components[0].value,'Original');
 const stale=fake();
 await ownerButton.execute(stale,client,confirm.split(':').slice(1));
 assert.match(stale.last.embeds[0].toJSON().description,/expired or was replaced/);
 const second=fake();
 second.fields={getTextInputValue:key=>({title:'Final',message:'Final message'})[key]};
 await ownerModal.execute(second,client,['announcement',owner]);
 const cancel=second.last.components[0].toJSON().components.find(b=>b.label==='Cancel').custom_id;
 const canceled=fake();
 await ownerButton.execute(canceled,client,cancel.split(':').slice(1));
 assert.match(canceled.last.embeds[0].toJSON().description,/Nothing was sent/);
});
test('Health view shows safe live runtime diagnostics and refreshes on demand',async()=>{
 const view=fake();
 await ownerButton.execute(view,client,['health']);
 assert.match(view.last.embeds[0].toJSON().description,/Live Bot Diagnostics/);
 const names=view.last.embeds[0].toJSON().fields.map(f=>f.name);
 assert.ok(names.some(name=>name.includes('Gateway Ping')));
 assert.ok(names.some(name=>name.includes('Memory')));
 assert.ok(names.some(name=>name.includes('Database')));
 const nav=view.last.components[0].toJSON().components;
 assert.ok(nav.some(b=>b.custom_id==='owner_action:health'));
});
test('configured bot owners have access while ordinary users are blocked',async()=>{
 const other='333333333333333333';
 assert.equal(isBotOwner(guest),false);
 const owners=botConfig.commands.owners;
 if(!owners.includes(other))owners.push(other);
 try{
  const granted=fake(other);await ownerstats.execute(granted);
  assert.match(granted.last.embeds[0].toJSON().title,/Bot Owner Dashboard/);
  const viaButton=fake(other);
  await ownerButton.execute(viaButton,client,['open','announcement']);
  assert.equal(viaButton.modal.toJSON().custom_id,'owner_form:announcement:'+other);
 }finally{
  const index=owners.indexOf(other);
  if(index!==-1)owners.splice(index,1);
 }
 const denied=fake(guest);
 await ownerButton.execute(denied,client,['open','announcement']);
 assert.match(denied.last.content,/private Bot Owner Dashboard/);
 assert.equal(denied.modal,undefined);
});
test('retired /ownerstats is redirected, not registered again',()=>{
 assert.equal(isOwnerOnlyCommand('ownerstats'),false);
 assert.equal(resolveMovedSlashCommand('/ownerstats')?.command,'/bot-owner-dashboard');
});
