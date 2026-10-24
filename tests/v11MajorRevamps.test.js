import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection,PermissionsBitField,PermissionFlagsBits } from 'discord.js';
import {
 getDashboardFavourites,toggleDashboardFavourite,formatDashboardFavourites,
 updateDashboardSettingWithUndo,undoLastDashboardSetting,getDashboardUndo,
} from '../src/services/dashboardExperienceService.js';
import { buildTicketCommandCenter,filterTicketQueue } from '../src/utils/ticket/ticketCommandCenter.js';
import { auditPanelRoles,buildReactionRoleStudio } from '../src/utils/reactionRoles/reactionRoleStudio.js';
import { errorRescueComponents,getErrorRescueAdvice,errorRescueEmbed } from '../src/utils/errorRescue.js';
import { readFile } from 'node:fs/promises';

function fakeDb(storage=new Map()){
 return {
  get:async(k,def=null)=>storage.has(k)?structuredClone(storage.get(k)):def,
  set:async(k,v)=>{storage.set(k,structuredClone(v));return true;},
 };
}
const guildId='111111111111111111',owner='222222222222222222';

test('dashboard favourites are persisted per user and never erase existing selections',async()=>{
 const storage=new Map(),client={db:fakeDb(storage)};
 assert.deepEqual(await getDashboardFavourites(client,guildId,owner),[]);
 await toggleDashboardFavourite(client,guildId,owner,'ticketSystem');
 await toggleDashboardFavourite(client,guildId,owner,'reactionRoles');
 assert.deepEqual(await getDashboardFavourites({db:fakeDb(storage)},guildId,owner),['ticketSystem','reactionRoles']);
 await toggleDashboardFavourite(client,guildId,owner,'ticketSystem');
 assert.deepEqual(await getDashboardFavourites(client,guildId,owner),['reactionRoles']);
 assert.deepEqual(await getDashboardFavourites(client,guildId,'333333333333333333'),[]);
 assert.deepEqual(formatDashboardFavourites(['reactionRoles']),['🎭 Reaction Roles']);
 await assert.rejects(()=>toggleDashboardFavourite(client,guildId,owner,'bogus'));
});

test('staff inbox filters tickets and builds working pagination with no mutations',()=>{
 const tickets=[
  {id:'1',status:'open',priority:'urgent',createdAt:'2026-01-01T00:00:00Z',claimedBy:null,firstResponseAt:'2026-01-01T00:05:00Z'},
  {id:'2',status:'open',priority:'high',createdAt:'2026-01-02T00:00:00Z',claimedBy:'77',firstResponseAt:'2026-01-02T00:05:00Z'},
  {id:'3',status:'open',priority:'low',createdAt:'2026-01-03T00:00:00Z',waitingFor:'user'},
  {id:'4',status:'closed',priority:'medium',createdAt:'2026-01-04T00:00:00Z'},
  {id:'5',status:'open',priority:'low',createdAt:'2026-01-05T00:00:00Z',firstResponseAt:'2026-01-05T00:05:00Z'},
 ];
 assert.equal(filterTicketQueue(tickets,'open').length,4);
 assert.equal(filterTicketQueue(tickets,'unclaimed').length,3);
 assert.equal(filterTicketQueue(tickets,'urgent').length,2);
 assert.deepEqual(filterTicketQueue(tickets,'awaiting').map(x=>x.id),['3']);
 assert.deepEqual(filterTicketQueue(tickets,'closed').map(x=>x.id),['4']);
 const view=buildTicketCommandCenter(tickets,{},'unclaimed');
 assert.match(view.embeds[0].toJSON().title,/Ticket Command Center/);
 assert.equal(view.components[0].toJSON().components.length,5);
 assert.equal(view.components[1].toJSON().components.length,3);
 assert.deepEqual(view.allowedMentions,{parse:[]});
 assert.equal(tickets[0].status,'open');
});

test('reaction role studio flags dangerous, managed, missing and unassignable roles',()=>{
 const p={id:'111111111111111111',channelId:'222222222222222222',
  messageId:'333333333333333333',
  roles:['1','2','3','4','5']};
 const role=(name,position,bits=0n,managed=false)=>({
  name,position,managed,permissions:new PermissionsBitField(bits),
 });
 const roles=new Collection([
  ['1',role('Common',1)],['2',role('Admin',2,PermissionFlagsBits.Administrator)],
  ['3',role('Managed',2,0n,true)],['4',role('Above Beacon',12)],
 ]);
 const guild={id:guildId,members:{me:{roles:{highest:{position:10}}}},
  roles:{cache:roles},channels:{cache:new Map()}};
 const audits=auditPanelRoles(p,guild);
 assert.equal(audits[0].ok,true);
 assert.equal(audits.filter(x=>!x.ok).length,4);
 const result=buildReactionRoleStudio(guild,[p]);
 assert.match(result.embeds[0].toJSON().description,/preview/i);
 assert.match(JSON.stringify(result.embeds[0].toJSON()),/Security Preflight/);
 assert.ok(result.components[0].toJSON().components.some(x=>x.custom_id==='rr_studio_edit:'+p.messageId));
});

test('error rescue provides actionable steps, bounded custom IDs and support link',()=>{
 assert.match(getErrorRescueAdvice('database').steps.join(' '),/PostgreSQL/);
 assert.match(getErrorRescueAdvice('unknown',50013).heading,/permissions/i);
 const components=errorRescueComponents('permission','ERR_123');
 assert.equal(components[0].toJSON().components.length,2);
 assert.equal(components[0].toJSON().components[0].custom_id,'error_rescue:permission:ERR_123');
 assert.match(errorRescueEmbed('configuration').toJSON().description,/dashboard/);
});

test('new persistent handlers and subcommands are wired into Beacon',async()=>{
 const files={
  'src/commands/Core/dashboard.js':/dashboard_undo:/,
  'src/commands/Ticket/modules/ticketActions.js':/loadTicketCommandCenter/,
  'src/commands/Reaction_roles/reactroles.js':/setName\('studio'\)/,
  'src/utils/errorHandler.js':/errorRescueComponents/,
 };
 for(const [path,regex] of Object.entries(files))
  assert.match(await readFile(path,'utf8'),regex,path);
});

test('dashboard setting undo restores the original value and survives a simulated restart',async()=>{
 const store=new Map();
 const client={db:fakeDb(store),guilds:{cache:new Map([
  [guildId,{id:guildId,channels:{cache:new Map()},roles:{cache:new Map()},members:{me:{roles:{highest:{position:10}}}}}]
 ])}};
 const changed=await updateDashboardSettingWithUndo(client,guildId,'prefix','$',owner);
 assert.equal(changed.changed,true);
 const ready=await getDashboardUndo({...client,db:fakeDb(store)},guildId);
 assert.equal(ready.key,'prefix');
 assert.equal(ready.after,'$');
 const undone=await undoLastDashboardSetting({...client,db:fakeDb(store)},guildId,owner,{isOwner:true});
 assert.equal(undone.ok,true);
 assert.equal(await getDashboardUndo(client,guildId),null);
});

test('dashboard undo does not overwrite a subsequent independent configuration change',async()=>{
 const store=new Map();
 const guild={id:guildId,channels:{cache:new Map()},roles:{cache:new Map()},
  members:{me:{roles:{highest:{position:10}}}}};
 const client={db:fakeDb(store),guilds:{cache:new Map([[guildId,guild]])}};
 await updateDashboardSettingWithUndo(client,guildId,'prefix','$',owner);
 const raw=store.get('guild:'+guildId+':config');
 store.set('guild:'+guildId+':config',{...raw,prefix:'!'});
 const result=await undoLastDashboardSetting(client,guildId,owner,{isOwner:true});
 assert.equal(result.ok,false);
 assert.match(result.reason,/changed since/);
 assert.equal(store.get('guild:'+guildId+':config').prefix,'!');
});
