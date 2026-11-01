import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getRegisteredCommandCount } from '../../../utils/commandCounts.js';

const button=(id,label,emoji,style=ButtonStyle.Secondary)=>
 new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const row=(...controls)=>new ActionRowBuilder().addComponents(...controls);
export const OWNER_ACTIONS=Object.freeze({
 giveexp:{label:'Grant Server XP',description:'Add server progression XP',emoji:'📈'},
 removeexp:{label:'Remove Server XP',description:'Correct server progression XP',emoji:'📉'},
 exclude:{label:'Exclude From Rankings',description:'Exclude server and update Founder ranks',emoji:'🚫'},
 restore:{label:'Restore To Rankings',description:'Restore server to global progression',emoji:'✅'},
 announcement:{label:'Network Announcement',description:'Send only to subscribed update channels',emoji:'📢'},
 export:{label:'Progression Backup',description:'Download saved XP and Founder records',emoji:'💾'},
 guilds:{label:'Connected Servers',description:'See all servers Beacon is in',emoji:'🌐'},
 restart:{label:'Restart Beacon',description:'Requires a second confirmation',emoji:'🔁'},
});
export const OWNER_FORM_FIELDS=Object.freeze({
 giveexp:[{id:'server_id',label:'Server ID',max:20},{id:'amount',label:'XP to grant (1 to 1 billion)',max:10}],
 removeexp:[{id:'server_id',label:'Server ID',max:20},{id:'amount',label:'XP to remove (1 to 1 billion)',max:10}],
 exclude:[{id:'server_id',label:'Server ID to exclude',max:20}],
 restore:[{id:'server_id',label:'Server ID to restore',max:20}],
 announcement:[{id:'title',label:'Announcement title',max:150},
  {id:'message',label:'Message to opt-in update channels',max:1800,multiline:true}],
});
export function buildOwnerDashboard(client,section='home',notice=''){
 const guilds=Array.from(client.guilds?.cache?.values?.()||[]);
 const sum=f=>guilds.reduce((total,g)=>total+(Number(f(g))||0),0);
 const descriptions={
  home:'**Bot Owner Control Centre**\nYour private command centre for Beacon. Use the quick controls below, or select any owner operation from the menu. Nothing here requires an extra slash command.',
  progression:'**Progression Management**\nGrant/remove XP, exclude servers from rankings or restore them. Founder reassignment uses the existing protection rules.',
  announcements:'**Beacon Network Announcements**\nPress **Compose Announcement** to write an update, review it in private, then confirm delivery to opted-in servers. Submitting the form does **not** send it.',
  health:'**Live Bot Diagnostics**\nRuntime indicators are read from the current Beacon process. Refresh this page to update them. No database writes or remote actions are performed.',
  maintenance:'**Maintenance & Recovery**\nView connected servers, export progression records and confirm a scheduled restart.',
 };
 const nav=row(
  button('owner_action:home','Overview','🏠',ButtonStyle.Primary),
  button('owner_action:progression','Progression','📈'),
  button('owner_action:announcements','Announcements','📢'),
  button('owner_action:health','Health','🩺'),
  button('owner_action:maintenance','Maintenance','🛠️'));
 // Each category exposes useful action buttons, without another slash command.
 const quickActions={
  home:[['announcement','Compose Announcement'],['guilds','Connected Servers'],['export','Backup']],
  announcements:[['announcement','Compose Announcement']],
  progression:[['giveexp','Grant XP'],['removeexp','Remove XP'],['exclude','Exclude'],['restore','Restore']],
  maintenance:[['guilds','Connected Servers'],['export','Export Backup'],['restart','Restart Beacon']],
  health:[['guilds','Inspect Servers'],['export','Export Backup']],
 };
 const quick=row(...(quickActions[section]||quickActions.home).map(([action,label])=>
  button('owner_action:open:'+action,label,OWNER_ACTIONS[action].emoji,
   action==='restart'?ButtonStyle.Danger:action==='announcement'?ButtonStyle.Primary:ButtonStyle.Secondary)));
 const memoryMb=Math.round((process.memoryUsage?.().rss||0)/1024/1024);
 const rawPing=client.ws?.ping;
 const ping=Number.isFinite(rawPing)&&rawPing>=0?Math.round(rawPing)+' ms':'Unavailable';
 const db=client.db;
 const databaseStatus=!db?'Not connected':
  typeof db.isDegraded==='function'?(db.isDegraded()?'Degraded / offline':'Available'):'Status unavailable';
 const seconds=Math.max(0,Math.floor(process.uptime()));
 const uptime=[Math.floor(seconds/86400)+'d',Math.floor(seconds%86400/3600)+'h',
  Math.floor(seconds%3600/60)+'m'].join(' ');
 const baseFields=[
  {name:'🌐 Connected Servers',value:String(guilds.length),inline:true},
  {name:'👥 Members (estimate)',value:sum(g=>g.memberCount).toLocaleString('en-AU'),inline:true},
  {name:'📚 Slash Commands',value:String(getRegisteredCommandCount(client)),inline:true},
  {name:'⏱️ Uptime',value:uptime,inline:true},
  {name:'📶 Gateway Ping',value:ping,inline:true},
  {name:'🗃️ Database',value:databaseStatus,inline:true},
 ];
 const healthFields=[
  {name:'🗃️ Database',value:databaseStatus,inline:true},
  {name:'📶 Gateway Ping',value:ping,inline:true},
  {name:'⏱️ Uptime',value:uptime,inline:true},
  {name:'🧠 Memory (RSS)',value:memoryMb.toLocaleString('en-AU')+' MB',inline:true},
  {name:'📝 Cached Channels',value:sum(g=>g.channels?.cache?.size).toLocaleString('en-AU'),inline:true},
  {name:'🎭 Cached Roles',value:sum(g=>g.roles?.cache?.size).toLocaleString('en-AU'),inline:true},
 ];
 const menu=new StringSelectMenuBuilder().setCustomId('owner_dashboard:choose')
  .setPlaceholder('Select an owner operation')
  .addOptions(Object.entries(OWNER_ACTIONS).map(([value,o])=>({
   label:o.label,description:o.description,emoji:o.emoji,value,
  })));
 return {
  content:'',allowedMentions:{parse:[]},
  embeds:[createEmbed({title:'👑 Beacon • Bot Owner Dashboard',
   description:(descriptions[section]||descriptions.home)+(notice?'\n\n'+notice:''),
   fields:section==='health'?healthFields:baseFields,
   color:databaseStatus==='Degraded / offline'?'warning':'primary',
   footer:'Private • Bot owner access • Metrics are process-local'})],
  components:[nav,quick,row(menu)],
 };
}
export function buildOwnerGuildList(client,page=0){
 const guilds=Array.from(client.guilds?.cache?.values?.()||[])
  .sort((a,b)=>a.name.localeCompare(b.name));
 const pages=Math.max(1,Math.ceil(guilds.length/12)),safe=Math.max(0,Math.min(pages-1,page));
 const lines=guilds.slice(safe*12,safe*12+12).map((g,j)=>
  String(safe*12+j+1)+'. '+String(g.name||'Unknown').replace(/([\\`*_~|>])/g,'\\$1').replaceAll('@','@\u200b').slice(0,75)+' (`'+g.id+'`)');
 // Discord requires unique custom IDs even on DISABLED buttons.
 // With a single page, both arrows previously targeted page 0 and Discord
 // rejected the entire response (50035 COMPONENT_CUSTOM_ID_DUPLICATED).
 const controls=[];
 if(pages>1){
  const back=button('owner_action:guilds:'+Math.max(0,safe-1)+':previous','Previous','⬅️').setDisabled(safe===0);
  const next=button('owner_action:guilds:'+Math.min(pages-1,safe+1)+':next','Next','➡️').setDisabled(safe+1===pages);
  controls.push(row(back,next));
 }
 controls.push(row(button('owner_action:home','Return to Dashboard','🏠',ButtonStyle.Primary)));
 return {content:'',allowedMentions:{parse:[]},
  embeds:[createEmbed({title:'🌐 Connected Beacon Servers',
   description:lines.join('\n')||'No connected servers.',color:'primary',
   footer:'Owner only • Page '+(safe+1)+' of '+pages})],
  components:controls,
 };
}
export function buildOwnerRestartConfirmation(){
 return {content:'',allowedMentions:{parse:[]},
  embeds:[createEmbed({title:'⚠️ Restart Beacon?',
   description:'This schedules a graceful restart and temporarily interrupts Beacon services.\n\nNo restart has occurred yet. Only confirm if you intend to restart.',
   color:'warning',footer:'Owner verification • Confirmation required'})],
  components:[row(
   button('owner_action:restart-confirm','Confirm Restart','🔁',ButtonStyle.Danger),
   button('owner_action:home','Cancel','⬅️'),
  )],
 };
}

/**
 * A review-only screen. No broadcast occurs until its single-use confirm
 * button is handled by ownerDashboardActions. Pending content is not persisted.
 */
export function buildOwnerAnnouncementPreview({title,message,ownerId,token}){
 const base='owner_action:announce-';
 const suffix=':'+ownerId+':'+token;
 return {
  content:'',allowedMentions:{parse:[]},
  embeds:[createEmbed({
   title:'📢 Review Beacon Announcement',
   description:'**Preview — NOT SENT**\n\n**'+title+'**\n\n'+message,
   color:'warning',
   fields:[
    {name:'📬 Recipients',value:'Only servers with a configured Beacon updates channel',inline:false},
    {name:'🔐 Confirmation',value:'One use • expires after 5 minutes • no automatic retries',inline:false},
   ],
   footer:'Only Confirm Broadcast sends this announcement',
  })],
  components:[row(
   button(base+'confirm'+suffix,'Confirm Broadcast','📢',ButtonStyle.Danger),
   button(base+'edit'+suffix,'Edit','✏️'),
   button(base+'cancel'+suffix,'Cancel','❌'),
  )],
 };
}
