import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../embeds.js';
import { listGuildTickets } from '../database/tickets.js';
import { evaluateTicketSla,getTicketSlaMinutes } from '../../services/ticketSlaService.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

const FILTERS=[
 {id:'open',label:'All Open',emoji:'📥'},
 {id:'unclaimed',label:'Unclaimed',emoji:'🙋'},
 {id:'urgent',label:'Urgent',emoji:'🚨'},
 {id:'awaiting',label:'Needs Reply',emoji:'⏳'},
 {id:'closed',label:'Closed',emoji:'📦'},
];
const rank={urgent:0,high:1,medium:2,low:3,none:4};
const PAGE_SIZE=7;
const timestamp=date=>{
 const ms=Date.parse(date);
 return Number.isFinite(ms)?'<t:'+Math.floor(ms/1000)+':R>':'Unknown';
};
export function filterTicketQueue(tickets,filter='open'){
 const records=(tickets||[]).filter(t=>t && typeof t==='object');
 const filtered=records.filter(t=>{
  if(filter==='closed')return t.status==='closed'||t.status==='archived';
  if(t.status!=='open')return false;
  if(filter==='unclaimed')return !t.claimedBy;
  if(filter==='urgent')return t.priority==='urgent'||t.priority==='high';
  // First response is a persisted ticket fact; never infer that the user has replied.
  if(filter==='awaiting')return !t.firstResponseAt||t.waitingFor==='staff';
  return true;
 });
 return filtered.sort((a,b)=>(rank[a.priority]??4)-(rank[b.priority]??4)
   ||Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
}
export function buildTicketCommandCenter(tickets,config={},filter='open',page=0){
 const safeFilter=FILTERS.some(f=>f.id===filter)?filter:'open';
 const matched=filterTicketQueue(tickets,safeFilter);
 const pages=Math.max(1,Math.ceil(matched.length/PAGE_SIZE));
 const current=Math.max(0,Math.min(pages-1,Number.isFinite(+page)?Math.trunc(+page):0));
 const open=(tickets||[]).filter(x=>x?.status==='open');
 const unclaimed=open.filter(x=>!x.claimedBy);
 const overdue=open.filter(x=>evaluateTicketSla(x,config).overdue);
 const fields=matched.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map(ticket=>({
  name:(evaluateTicketSla(ticket,config).overdue?'⏰ ':'')
    +(ticket.priority==='urgent'?'🔴 ':'🎫 ')
    +(ticket.ticketNumber?'#'+ticket.ticketNumber:'Ticket')
    +' • '+String(ticket.priority||'normal').toUpperCase(),
  value:(ticket.status==='archived'?'Archived ticket':(ticket.id?'<#'+ticket.id+'>':'Channel unavailable'))
    +' • '+(ticket.claimedBy?'Assigned to <@'+ticket.claimedBy+'>':'**Unclaimed**')
    +'\nOpened '+timestamp(ticket.createdAt)
    +(ticket.waitingFor==='staff'?' • Awaiting staff response':(!ticket.firstResponseAt&&ticket.status==='open'?' • No staff reply recorded':'')),
  inline:false,
 }));
 const label=FILTERS.find(x=>x.id===safeFilter)?.label;
 const embed=createEmbed({
  title:'🎫 Beacon • Ticket Command Center',
  description:'**'+open.length+' open** • **'+unclaimed.length+' unclaimed** • **'+overdue.length+
    ' overdue**\nSLA: '+(getTicketSlaMinutes(config)?getTicketSlaMinutes(config)+' minutes':'Off')+
    '\n\n**'+label+'** • '+matched.length+' tickets • Page '+(current+1)+'/'+pages+
    '\nOnly authorised support staff can view this dashboard.',
  color:overdue.length?'warning':'primary',
  fields:fields.length?fields:[{name:'Nothing to show',value:'No requests match this filter.',inline:false}],
  footer:'Beacon • Private support management • Filters do not modify ticket records',
 });
 const row1=new ActionRowBuilder().addComponents(FILTERS.map(item=>
  new ButtonBuilder().setCustomId('ticket_queue_view:'+item.id+':0')
    .setLabel(item.label).setEmoji(item.emoji)
    .setStyle(item.id===safeFilter?ButtonStyle.Primary:ButtonStyle.Secondary)));
 const row2=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ticket_queue_view:'+safeFilter+':'+Math.max(0,current-1))
    .setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current===0),
  new ButtonBuilder().setCustomId('ticket_queue_view:'+safeFilter+':'+Math.min(pages-1,current+1))
    .setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current===pages-1),
  new ButtonBuilder().setCustomId('ticket_queue_view:'+safeFilter+':'+current)
    .setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
 );
 return {embeds:[embed],components:[row1,row2],allowedMentions:{parse:[]}};
}
export async function loadTicketCommandCenter(client,guildId,filter='open',page=0){
 const [tickets,config]=await Promise.all([
  listGuildTickets(guildId),getGuildConfig(client,guildId)
 ]);
 return buildTicketCommandCenter(tickets,config,filter,page);
}
