import { ActionRowBuilder,ButtonBuilder,ButtonStyle } from 'discord.js';
import { createEmbed } from './embeds.js';
import {
 getSandWallet,getSandDailyStatusFromWallet,SAND_DAILY_LIMIT,SAND_WEEKLY_LIMIT,
 SAND_NOTIFICATION_TYPES,
} from '../services/sandCoinsService.js';

const fmt=n=>Number(n||0).toLocaleString('en-US')+' SC';
const button=(action,label,emoji,primary=false,disabled=false)=>new ButtonBuilder()
 .setCustomId('sand_wallet:'+action).setLabel(label).setEmoji(emoji)
 .setStyle(primary?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(disabled);
const nextUtc=now=>Math.floor(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)/1000);
const nextWeek=now=>{
 const utcDay=(now.getUTCDay()+6)%7;
 return Math.floor(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+7-utcDay)/1000);
};
export const SAND_HISTORY_FILTERS=Object.freeze(['all','earned','spent','payments','treasury']);
const kinds={
 quest:'🎯 Quest reward',daily:'🔥 Daily streak',dispatch:'📡 Dispatch reward',purchase:'🎨 Shop purchase',
 payment_sent:'↗️ Payment sent',payment_received:'↙️ Payment received',
 treasury_donation:'🏦 Treasury donation',treasury_payout:'🏦 Treasury payout',
};
export function sandHistoryMatches(entry,filter='all'){
 if(filter==='all')return true;
 if(filter==='earned')return entry.delta>0;
 if(filter==='spent')return entry.delta<0;
 if(filter==='payments')return entry.kind==='payment_sent'||entry.kind==='payment_received';
 if(filter==='treasury')return entry.kind?.startsWith('treasury_');
 return false;
}
export function sandHistoryLabel(entry){
 const date=Date.parse(entry.at);
 const timestamp=Number.isFinite(date)?'<t:'+Math.floor(date/1000)+':f>':'Unknown date';
 const amount=(entry.delta>=0?'+':'−')+fmt(Math.abs(Number(entry.delta)||0));
 const extra=entry.itemId?' • '+String(entry.itemId).slice(0,40):'';
 return (kinds[entry.kind]||'🪙 Wallet activity')+extra+'\n**'+amount+'** • '+timestamp;
}
export async function buildSandWalletPanel(client,userId,view='home',filter='all',page=0,now=new Date()){
 const w=await getSandWallet(client,userId);
 const daily=getSandDailyStatusFromWallet(w,now);
 const effectiveFilter=SAND_HISTORY_FILTERS.includes(filter)?filter:'all';
 const rows=[new ActionRowBuilder().addComponents(
  button('home','Wallet','🪙',view==='home'),
  button('daily','Claim Daily','🎁',false,daily.alreadyClaimed),
  button('history:all:0','History','📜',view==='history'),
  button('shop','Shop','🛒'),
  button('dispatch','Dispatch','📡'),
 ),new ActionRowBuilder().addComponents(button('alerts','Notifications','🔔',view==='alerts'))];
 let embed;
 if(view==='history'){
  const entries=w.history.filter(h=>sandHistoryMatches(h,effectiveFilter));
  const totalPages=Math.max(1,Math.ceil(entries.length/5));
  const currentPage=Math.max(0,Math.min(totalPages-1,Number(page)||0));
  embed=createEmbed({title:'📜 Your Sand Coins Transactions',
   description:'**'+entries.length+' entries** matching **'+effectiveFilter+'** • Page '+(currentPage+1)+'/'+totalPages+
    '\n\n'+(entries.slice(currentPage*5,currentPage*5+5).map(sandHistoryLabel).join('\n\n')||'No transactions in this view.'),
   color:'primary',footer:'Private • Latest 30 wallet events retained • No currency rules changed'});
  rows.push(new ActionRowBuilder().addComponents(
   ...SAND_HISTORY_FILTERS.map(x=>button('history:'+x+':0',x[0].toUpperCase()+x.slice(1),'🔎',effectiveFilter===x))));
  rows.push(new ActionRowBuilder().addComponents(
   button('history:'+effectiveFilter+':'+(currentPage-1),'Previous','⬅️',false,currentPage===0),
   button('history:'+effectiveFilter+':'+(currentPage+1),'Next','➡️',false,currentPage===totalPages-1)));
 }else if(view==='alerts'){
  embed=createEmbed({title:'🔔 Economy Notifications',
   description:'These are **optional private DMs**. Off by default. A disabled DM inbox never cancels a transaction.\n\n'+
    '• **Payments:** When you receive a transfer.\n'+
    '• **Purchases:** When a decoration is bought for a server you own.\n'+
    '• **Daily:** Once per UTC day if an active streak is at risk.\n'+
    '• **Potions:** When your server’s treasury boost expires.',
   fields:SAND_NOTIFICATION_TYPES.map(type=>({name:type[0].toUpperCase()+type.slice(1),
    value:w.notifications?.[type]?'✅ Enabled':'🔕 Disabled',inline:true})),
   color:'primary',footer:'Preferences are global and saved in your PostgreSQL wallet'});
  rows.push(new ActionRowBuilder().addComponents(
   ...SAND_NOTIFICATION_TYPES.map(type=>button('toggle:'+type,
    (w.notifications?.[type]?'Disable ':'Enable ')+type,'🔔',Boolean(w.notifications?.[type])))));
 }else{
  const today=w.day===now.toISOString().slice(0,10)?w.earnedToday:0;
  const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(now.getUTCDay()+6)%7)).toISOString().slice(0,10);
  const weekly=w.week===monday?w.earnedWeek:0;
  embed=createEmbed({title:'🪙 Your Global Sand Coins Wallet',
   description:'**'+fmt(w.balance)+' available** • Your wallet works across every Beacon server.\n'+
    'Quest and daily rewards are tracked separately; daily streak claims do not use quest limits.',
   fields:[
    {name:'Lifetime earned',value:fmt(w.lifetime),inline:true},
    {name:'🔥 Daily streak',value:'Day '+daily.streak+'/7 • '+(daily.alreadyClaimed?'Already claimed':'Next: '+fmt(daily.nextReward)),inline:true},
    {name:'🎯 Quest coins today',value:fmt(today)+' / '+fmt(SAND_DAILY_LIMIT)+'\nResets <t:'+nextUtc(now)+':R>',inline:true},
    {name:'📅 Quest coins this week',value:fmt(weekly)+' / '+fmt(SAND_WEEKLY_LIMIT)+'\nResets <t:'+nextWeek(now)+':R>',inline:true},
    {name:'Recent activity',value:w.history.slice(0,3).map(x=>(x.delta>=0?'🟢 +':'🔴 −')+fmt(Math.abs(x.delta))+' • '+(kinds[x.kind]||'Activity')).join('\n')||'No transactions yet.'},
   ],color:'primary',footer:'Your wallet and history are private • UTC resets'});
 }
 return {embeds:[embed],components:rows,allowedMentions:{parse:[]},attachments:[]};
}
