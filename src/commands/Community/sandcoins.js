import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { resolveLogChannel } from '../../services/loggingService.js';
import {
 SAND_CATALOG,SAND_SLOTS,getSandWallet,getSandServer,getSandCatalogItem,
 getSandAppearance,buySandDecoration,equipSandDecoration,deliverSandPurchaseLogs,getSandLimitedStock,
 getSandGlobalLeaderboard,setSandLeaderboardHidden,getSandDailyStatusFromWallet,
} from '../../services/sandCoinsService.js';
import { logger } from '../../utils/logger.js';
import { respondSandDaily } from '../../utils/sandDailyReply.js';
import { respondSandPay,respondSandTrade } from '../../utils/sandTradingCommands.js';

const name=item=>item?.name||'Unknown Decoration';
const format=n=>n.toLocaleString('en-US')+' SC';
const short=s=>String(s||'').replace(/[@*_`~<>|]/g,'').slice(0,80);
function isManager(interaction){
 return interaction.guild?.ownerId===interaction.user.id ||
   interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
async function verifyAuditChannel(interaction){
 const config=await getGuildConfig(interaction.client,interaction.guildId);
 const id=resolveLogChannel(config,'audit');
 if(!id)return {error:'Configure a **server audit/logs channel** in /dashboard before purchasing rank-card decorations.'};
 const channel=interaction.guild?.channels.cache.get(id)||
   await interaction.guild?.channels.fetch(id).catch(()=>null);
 const botMember=interaction.guild?.members.me||
   await interaction.guild?.members.fetchMe?.().catch(()=>null);
 if(!channel?.send||!botMember||!channel?.permissionsFor?.(botMember)?.has([
  PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks
 ]))return {error:'Beacon cannot send purchase logs to the configured audit channel. Give it **Send Messages** and **Embed Links** permissions, then try again.'};
 return {channel};
}
function ownedDescription(server){
 const appearance=getSandAppearance(server);
 return SAND_SLOTS.map(slot=>{
  const items=SAND_CATALOG.filter(item=>item.type===slot&&server.inventory.includes(item.id));
  return {name:(slot==='background'?'🌄 ':slot==='border'?'💠 ':'🏷️ ')+slot.toUpperCase(),
   value:items.length?items.map(item=> (appearance[slot]===item.id?'✅ ':'▫️ ')+
    item.name+' (\`'+item.id+'\`)').join('\n'):'Nothing purchased for this slot yet.'};
 });
}
export default {
 slashOnly:true,
 category:'Community',
 data:new SlashCommandBuilder()
  .setName('sandcoins')
  .setDescription('Earn global Sand Coins from quests and daily streaks; customise rank cards')
  .setDMPermission(false)
  .addSubcommand(s=>s.setName('wallet').setDescription('See your global Sand Coins balance and earnings'))
  .addSubcommand(s=>s.setName('daily').setDescription('Claim daily Sand Coins; consecutive days earn more (max day 7)'))
  .addSubcommand(s=>s.setName('leaderboard').setDescription('See the all-time global Sand Coin earners'))
  .addSubcommand(s=>s.setName('privacy').setDescription('Hide or show your identity on global coin rankings')
   .addBooleanOption(o=>o.setName('hidden').setDescription('Hide yourself from the public ranking').setRequired(true)))
  .addSubcommand(s=>s.setName('shop').setDescription('Browse rank-card decorations for this server'))
  .addSubcommand(s=>s.setName('inventory').setDescription('See rank-card cosmetics owned by this server'))
  .addSubcommand(s=>s.setName('buy').setDescription('Use your coins to buy a rank-card item for THIS server')
   .addStringOption(o=>o.setName('item').setDescription('Decoration to buy for the current server')
    .setRequired(true).addChoices(...SAND_CATALOG.map(item=>({name:item.name,value:item.id})))))
  .addSubcommand(s=>s.setName('equip').setDescription('Manager: equip an owned item on this server rank card')
   .addStringOption(o=>o.setName('item').setDescription('Owned decoration to equip')
    .setRequired(true).addChoices(...SAND_CATALOG.map(item=>({name:item.name,value:item.id})))))
  .addSubcommand(s=>s.setName('unequip').setDescription('Manager: remove the equipped decoration from a rank-card slot')
   .addStringOption(o=>o.setName('slot').setDescription('Rank-card slot').setRequired(true)
    .addChoices(...SAND_SLOTS.map(slot=>({name:slot,value:slot)))))
  .addSubcommand(s=>s.setName('pay').setDescription('Send Sand Coins from your global wallet to another member')
   .addUserOption(o=>o.setName('member').setDescription('Server member receiving the coins').setRequired(true))
   .addIntegerOption(o=>o.setName('amount').setDescription('Sand Coins to send (1-10,000)').setMinValue(1).setMaxValue(10000).setRequired(true)))
  .addSubcommandGroup(group=>group.setName('trade').setDescription('Owner-only trades between server inventories')
   .addSubcommand(s=>s.setName('offer').setDescription('Owner: propose an item swap with another Beacon server')
    .addStringOption(o=>o.setName('server').setDescription('Other server ID (Developer Mode → Copy Server ID)').setRequired(true))
    .addStringOption(o=>o.setName('give').setDescription('Item your server offers').setRequired(true)
     .addChoices(...SAND_CATALOG.map(i=>({name:i.name,value:i.id}))))
    .addStringOption(o=>o.setName('want').setDescription('Item you request from the other server').setRequired(true)
     .addChoices(...SAND_CATALOG.map(i=>({name:i.name,value:i.id})))))
   .addSubcommand(s=>s.setName('inbox').setDescription('Owner: list incoming and outgoing inventory trade offers'))
   .addSubcommand(s=>s.setName('status').setDescription('Owner: inspect a trade before approving')
    .addStringOption(o=>o.setName('id').setDescription('Trade ID').setRequired(true)))
   .addSubcommand(s=>s.setName('accept').setDescription('Owner: accept a trade offered to THIS server')
    .addStringOption(o=>o.setName('id').setDescription('Trade ID').setRequired(true)))
   .addSubcommand(s=>s.setName('decline').setDescription('Owner: decline an offer to THIS server')
    .addStringOption(o=>o.setName('id').setDescription('Trade ID').setRequired(true)))
   .addSubcommand(s=>s.setName('cancel').setDescription('Owner: cancel an offer FROM this server')
    .addStringOption(o=>o.setName('id').setDescription('Trade ID').setRequired(true)))),
 async execute(interaction){
  if(!interaction.guild)return InteractionHelper.safeReply(interaction,{
   content:'Open Sand Coins from a server using Beacon.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(!(await InteractionHelper.safeDefer(interaction,['leaderboard','daily'].includes(sub)?{}:{flags:MessageFlags.Ephemeral})))return;
  try{
   if(['equip','unequip'].includes(sub)&&!isManager(interaction))
    return InteractionHelper.safeEditReply(interaction,{
     content:'🔒 Only the server owner or members with **Manage Server** can change the public rank-card appearance.'});
   if(sub==='daily')return respondSandDaily(interaction);
   if(sub==='pay')return respondSandPay(interaction);
   if(interaction.options.getSubcommandGroup(false)==='trade')return respondSandTrade(interaction);
   if(sub==='leaderboard'){
    const players=await getSandGlobalLeaderboard(interaction.client,10);
    return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
     title:'🏆 Beacon • Global Sand Coin Rankings',
     description:players.length?players.map((p,i)=>(['🥇','🥈','🥉'][i]||'🪙')+
      ' **#'+(i+1)+'** <@'+p.userId+'> • **'+format(p.earned)+'** lifetime earned').join('\n'):
      'No ranked Sand Coins earners yet. Help your server complete its quests!',
     color:'primary',footer:'Ranked by lifetime Sand Coins earned • /sandcoins privacy to opt out',
    })],allowedMentions:{parse:[]}});
   }
   if(sub==='privacy'){
    const hidden=interaction.options.getBoolean('hidden',true);
    await setSandLeaderboardHidden(interaction.client,interaction.user.id,hidden);
    return InteractionHelper.safeEditReply(interaction,{content:hidden?
     '🔒 Your name is now hidden from global Sand Coins rankings; your wallet and earnings are unchanged.':
     '✅ Your name is visible on the global Sand Coins rankings again.'});
   }
   if(sub==='wallet'){
    const w=await getSandWallet(interaction.client,interaction.user.id);
    const d=getSandDailyStatusFromWallet(w);
    return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
     title:'🪙 Your Global Sand Coins Wallet',
     description:'Your Sand Coins follow you across **all** Beacon communities. Earn coins from quests and /daily streaks.',
     fields:[
      {name:'Available',value:'**'+format(w.balance)+'**',inline:true},
      {name:'Lifetime Earned',value:format(w.lifetime),inline:true},
      {name:'Quest Coins Today',value:format(w.earnedToday),inline:true},
      {name:'🔥 Daily Streak',value:'**'+d.streak+'/7** • '+(d.alreadyClaimed?'Claimed today':'Next reward: '+format(d.nextReward)),inline:true},
      {name:'Recent Activity',value:w.history.length?w.history.slice(0,5).map(h=>
       (h.delta>=0?'🟢 +':'🔴 ')+format(h.delta)+' • '+(h.kind==='quest'?'Quest reward':h.kind==='daily'?'Daily streak reward':'Rank-card purchase')).join('\n'):'No transactions yet.'},
     ],color:'primary',footer:'Beacon • Sand Coins • Daily claims reset at 00:00 UTC',
    })]});
   }
   if(sub==='shop'||sub==='inventory'){
    const server=await getSandServer(interaction.client,interaction.guildId);
    if(server.pendingLogs.length)await deliverSandPurchaseLogs(interaction.client,interaction.guildId).catch(()=>{});
    if(sub==='inventory')return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
     title:'🎨 '+short(interaction.guild.name)+' • Rank-Card Inventory',
     description:'Members can purchase these decorations with global Sand Coins. **Only the owner or Manage Server admins** can equip them.\n\nThe selected items appear on /progression → Share Rank Card.',
     fields:ownedDescription(server),color:'primary',
    })]});
    const w=await getSandWallet(interaction.client,interaction.user.id);
    const stocks=await Promise.all(SAND_CATALOG.map(item=>getSandLimitedStock(interaction.client,item.id)));
    return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
     title:'🪙 Beacon • Sand Coins Shop',
     description:'**Your balance: '+format(w.balance)+'**\nPurchase here and the item goes into **'+short(interaction.guild.name)+'\'s server inventory** — not your personal inventory. Spend coins earned in any Beacon server.',
     fields:SAND_CATALOG.map((item,index)=>({name:(server.inventory.includes(item.id)?'✅ ':'▫️ ')+item.name+
      (item.limited?' • Limited Edition':''),value:item.description+'\n**'+format(item.price)+'** • ID: \`'+item.id+'\`'+
      (stocks[index]?' • **'+stocks[index].remaining+'/'+stocks[index].total+' left globally**':'')})),
     color:'primary',footer:'Use /sandcoins buy • Owners/admins equip with /sandcoins equip',
    })]});
   }
   if(sub==='buy'){
    const itemId=interaction.options.getString('item',true);
    const item=getSandCatalogItem(itemId);
    const audit=await verifyAuditChannel(interaction);
    if(audit.error)return InteractionHelper.safeEditReply(interaction,{content:'⚠️ '+audit.error});
    const result=await buySandDecoration(interaction.client,{
     userId:interaction.user.id,guildId:interaction.guildId,itemId,purchaseId:interaction.id,
    });
    if(result.error)return InteractionHelper.safeEditReply(interaction,{content:
     result.error==='ALREADY_OWNED'?'✅ This server already owns **'+name(item)+'**. Ask a manager to equip it with /sandcoins equip.':
     result.error==='SOLD_OUT'?'⚠️ This limited edition has sold out globally. No coins were spent.':
     '🪙 Not enough Sand Coins. This costs **'+format(item.price)+'** and your balance is **'+format(result.balance)+'**.'});
    const sent=await deliverSandPurchaseLogs(interaction.client,interaction.guildId).catch(e=>{
     logger.warn('Sand Coins purchase log pending',{guildId:interaction.guildId,error:e.message});
     return {error:'LOG_PENDING'};
    });
    return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
     title:'✅ Rank-Card Decoration Purchased!',
     description:'**'+name(item)+'** was added to **'+short(interaction.guild.name)+'\'s inventory**.',
     fields:[
      {name:'Paid',value:format(item.price),inline:true},
      {name:'Your Remaining Coins',value:format(result.balance),inline:true},
      {name:'Next Step',value:'The owner or a member with **Manage Server** can equip it using /sandcoins equip.'},
      {name:'Purchase Log',value:sent?.error||sent?.pending?'Queued for delivery to the server audit channel.':'Posted in the server audit channel.'},
     ],color:'success',
    })]});
   }
   if(sub==='equip'){
    const itemId=interaction.options.getString('item',true),item=getSandCatalogItem(itemId);
    const result=await equipSandDecoration(interaction.client,{
     guildId:interaction.guildId,itemId,slot:item.type,actorId:interaction.user.id,
    });
    if(result.error)return InteractionHelper.safeEditReply(interaction,{content:'🔒 This decoration is not in your server inventory. Members can purchase it via /sandcoins shop.'});
    return InteractionHelper.safeEditReply(interaction,{content:'✅ Equipped **'+name(item)+'** in the **'+item.type+'** slot for this server\'s rank card.'});
   }
   if(sub==='unequip'){
    const slot=interaction.options.getString('slot',true);
    await equipSandDecoration(interaction.client,{guildId:interaction.guildId,itemId:null,slot,actorId:interaction.user.id});
    return InteractionHelper.safeEditReply(interaction,{content:'✅ Removed the **'+slot+'** decoration from this server\'s rank card. The purchased item stays in its inventory.'});
   }
  }catch(err){
   logger.error('Sand Coins command failed',{guildId:interaction.guildId,sub,error:err.message});
   return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Sand Coins could not complete this action. No new purchase was confirmed. Try again or contact Beacon support.'});
  }
 },
};
