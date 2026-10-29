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
  home:'**Bot Owner Control Centre**\nEvery creator-only action is here. Pick a category or choose an operation from the menu. No extra slash commands.',
  progression:'**Progression Management**\nGrant/remove XP, exclude servers from rankings or restore them. Founder reassignment uses the existing protection rules.',
  announcements:'**Announcement Management**\nUpdates go only to channels that server admins configured. The unrestricted broadcast shortcut is retired.',
  maintenance:'**Maintenance & Recovery**\nView connected servers, export progression records and confirm a scheduled restart.',
 };
 const nav=row(
  button('owner_action:home','Overview','🏠',ButtonStyle.Primary),
  button('owner_action:progression','Progression','📈'),
  button('owner_action:announcements','Announcements','📢'),
  button('owner_action:maintenance','Maintenance','🛠️'));
 const menu=new StringSelectMenuBuilder().setCustomId('owner_dashboard:choose')
  .setPlaceholder('Select an owner operation')
  .addOptions(Object.entries(OWNER_ACTIONS).map(([value,o])=>({
   label:o.label,description:o.description,emoji:o.emoji,value,
  })));
 return {
  content:'',allowedMentions:{parse:[]},
  embeds:[createEmbed({title:'👑 Beacon • Bot Owner Dashboard',
   description:(descriptions[section]||descriptions.home)+(notice?'\n\n'+notice:''),
   fields:[
    {name:'🌐 Connected servers',value:String(guilds.length),inline:true},
    {name:'👥 Members (estimate)',value:sum(g=>g.memberCount).toLocaleString('en-AU'),inline:true},
    {name:'📚 Slash commands',value:String(getRegisteredCommandCount(client)),inline:true},
    {name:'📝 Channels',value:sum(g=>g.channels?.cache?.size).toLocaleString('en-AU'),inline:true},
    {name:'🎭 Roles',value:sum(g=>g.roles?.cache?.size).toLocaleString('en-AU'),inline:true},
    {name:'⏱️ Uptime',value:Math.floor(process.uptime()/3600)+' hours',inline:true},
   ],color:'primary',footer:'Owner only • All actions restricted to the primary Beacon owner'})],
  components:[nav,row(menu)],
 };
}
export function buildOwnerGuildList(client,page=0){
 const guilds=Array.from(client.guilds?.cache?.values?.()||[])
  .sort((a,b)=>a.name.localeCompare(b.name));
 const pages=Math.max(1,Math.ceil(guilds.length/12)),safe=Math.max(0,Math.min(pages-1,page));
 const lines=guilds.slice(safe*12,safe*12+12).map((g,j)=>
  String(safe*12+j+1)+'. '+g.name.replaceAll('@','@\u200b').slice(0,75)+' ('+g.id+')');
 const back=button('owner_action:guilds:'+Math.max(0,safe-1),'Previous','⬅️').setDisabled(safe===0);
 const next=button('owner_action:guilds:'+Math.min(pages-1,safe+1),'Next','➡️').setDisabled(safe+1===pages);
 return {content:'',allowedMentions:{parse:[]},
  embeds:[createEmbed({title:'🌐 Connected Beacon Servers',
   description:lines.join('\n')||'No connected servers.',color:'primary',
   footer:'Owner only • Page '+(safe+1)+' of '+pages})],
  components:[row(back,next),row(button('owner_action:home','Return to Dashboard','🏠',ButtonStyle.Primary))],
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
