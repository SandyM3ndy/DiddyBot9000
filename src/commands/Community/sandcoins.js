import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { resolveLogChannel } from '../../services/loggingService.js';
import {
 SAND_CATALOG,SAND_SLOTS,getSandWallet,getSandServer,getSandCatalogItem,
 getSandAppearance,buySandDecoration,equipSandDecoration,deliverSandPurchaseLogs,getSandLimitedStock,
 getSandGlobalLeaderboard,setSandLeaderboardHidden,getSandDailyStatusFromWallet,
 getSandInventoryProtectedSnapshot,
} from '../../services/sandCoinsService.js';
import { logger } from '../../utils/logger.js';
import { respondSandDaily } from '../../utils/sandDailyReply.js';
import { respondSandPay,respondSandTrade } from '../../utils/sandTradingCommands.js';
import { renderProgressionRankPng } from '../../utils/progressionRankCard.js';

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
  PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks
 ]))return {error:'Beacon cannot send purchase logs to the configured audit channel. Give it **View Channel**, **Send Messages**, and **Embed Links** permissions, then try again.'};
 return {channel};
}
function ownedDescription(server){
 const appearance=getSandAppearance(server);
 const fields=SAND_SLOTS.map(slot=>{
  const items=SAND_CATALOG.filter(item=>item.type===slot&&server.inventory.includes(item.id));
  return {name:(slot==='background'?'🌄 ':slot==='border'?'💠 ':'🏷️ ')+slot.toUpperCase(),
   value:items.length?items.map(item=>(appearance[slot]===item.id?'✅ ':'▫️ ')+
    item.name+' (`'+item.id+'`)').join('\n'):'Nothing purchased for this slot yet.'};
 });
 const retired=server.inventory.filter(id=>!SAND_CATALOG.some(item=>item.id===id));
 if(retired.length)fields.push({
  name:'📜 Legacy / Unlisted Decorations',
  value:retired.map(id=>'`'+id.replace(/[`\\]/g,'').slice(0,100)+'` • safely retained').join('\n').slice(0,1024),
 });
 return fields;
}
/**
 * Stable global component IDs: no collectors or session-specific messages.
 * Preview buttons keep working after bot restarts and tolerate rapid clicks.
 */
export function buildSandShopPreviewButtons(){
 const rows=[];
 for(let start=0;start<SAND_CATALOG.length;start+=4){
  rows.push(new ActionRowBuilder().addComponents(
   SAND_CATALOG.slice(start,start+4).map(item=>new ButtonBuilder()
    .setCustomId('sand_shop_preview:'+item.id)
    .setLabel('Preview '+item.name)
    .setStyle(ButtonStyle.Secondary))
  ));
 }
 rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
  .setCustomId('sand_shop_back')
  .setLabel('Shop Overview')
  .setEmoji('🛒')
  .setStyle(ButtonStyle.Primary)));
 return rows;
}

// Bounded render cache; the same cosmetic combination never has to compress a
// million-pixel rank card repeatedly when members click preview buttons quickly.
const PREVIEW_CACHE_MAX=64;
const previewPngCache=new Map();
export function buildSandShopItemPreview(itemId,server,serverName){
 const item=getSandCatalogItem(itemId);
 if(!item)throw new Error('Shop preview item unavailable');
 const equipped=getSandAppearance(server);
 const appearance={...equipped,[item.type]:item.id};
 const cleanServerName=short(serverName)||'BEACON SERVER';
 const key=JSON.stringify([itemId,cleanServerName,appearance.background,appearance.border,appearance.tag]);
 let png=previewPngCache.get(key);
 if(png){
  previewPngCache.delete(key);
  previewPngCache.set(key,png);
 }else{
  png=renderProgressionRankPng({
   name:cleanServerName,rank:42,level:14,xp:48500,progress:74,appearance,fastPreview:true,
  });
  previewPngCache.set(key,png);
  if(previewPngCache.size>PREVIEW_CACHE_MAX)
   previewPngCache.delete(previewPngCache.keys().next().value);
 }
 const imageName='beacon-preview-'+item.id+'.png';
 const owned=server.inventory.includes(item.id);
 const embed=createEmbed({
  title:'👁️ Preview • '+item.name,
  description:'**'+item.description+'**\n\n'+
   '**Price:** '+format(item.price)+' • **'+(owned?'Already owned by this server':'Not owned by this server')+'**\n'+
   'This is a **sample rank card** with your server\'s currently equipped cosmetics, '+
   'plus a preview of **'+item.name+'**. The rank and XP shown are examples.',
  fields:[
   {name:'Decoration Type',value:item.type.charAt(0).toUpperCase()+item.type.slice(1),inline:true},
   {name:'Preview Only',value:'No coins spent • No inventory or equipped items changed',inline:false},
  ],
  color:'primary',
  footer:'Beacon • Sand Coins Shop • Select another preview or Shop Overview',
 });
 embed.setImage('attachment://'+imageName);
 return {embeds:[embed],files:[new AttachmentBuilder(png,{name:imageName})],
  attachments:[],components:buildSandShopPreviewButtons()};
}

/** Public shop listing: never leak the invoking member's private wallet. */
export async function buildSandShopPanel(client,guildId,guildName){
 const [server,...stocks]=await Promise.all([
  getSandServer(client,guildId),
  ...SAND_CATALOG.map(item=>getSandLimitedStock(client,item.id)),
 ]);
 return {
  embeds:[createEmbed({
   title:'🪙 Beacon • Sand Coins Shop',
   description:'Browse cosmetics and **press Preview** to see each item on a sample rank card.\n'+
    'Previews are free, and purchases go into **'+short(guildName)+'\'s server inventory**.\n'+
    'Use /sandcoins wallet privately to check your coins.',
   fields:SAND_CATALOG.map((item,index)=>({
    name:(server.inventory.includes(item.id)?'✅ ':'▫️ ')+item.name+
     (item.limited?' • Limited Edition':''),
    value:item.description+'\n**'+format(item.price)+'** • ID: \`'+item.id+'\`'+
      (stocks[index]?' • **'+stocks[index].remaining+'/'+stocks[index].total+' left globally**':''),
   })),
   color:'primary',
   footer:'Preview with buttons • /sandcoins buy to purchase • /sandcoins equip to apply',
  })],
  components:buildSandShopPreviewButtons(),
  attachments:[],
 };
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
  .addSubcommand(s=>s.setName('backup').setDescription('Server owner: export a saved inventory recovery copy'))
  .addSubcommand(s=>s.setName('buy').setDescription('Use your coins to buy a rank-card item for THIS server')
   .addStringOption(o=>o.setName('item').setDescription('Decoration to buy for the current server')
    .setRequired(true).addChoices(...SAND_CATALOG.map(item=>({name:item.name,value:item.id})))))
  .addSubcommand(s=>s.setName('equip').setDescription('Manager: equip an owned item on this server rank card')
   .addStringOption(o=>o.setName('item').setDescription('Owned decoration to equip')
    .setRequired(true).addChoices(...SAND_CATALOG.map(item=>({name:item.name,value:item.id})))))
  .addSubcommand(s=>s.setName('unequip').setDescription('Manager: remove the equipped decoration from a rank-card slot')
   .addStringOption(o=>o.setName('slot').setDescription('Rank-card slot').setRequired(true)
    .addChoices(...SAND_SLOTS.map(slot=>({name:slot,value:slot})))))
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
  const publicCommands=new Set(['leaderboard','daily','shop','inventory','equip','unequip']);
  if(!(await InteractionHelper.safeDefer(interaction,publicCommands.has(sub)?{}:{flags:MessageFlags.Ephemeral})))return;
  try{
   if(['equip','unequip'].includes(sub)&&!isManager(interaction))
    return InteractionHelper.safeEditReply(interaction,{
     content:'🔒 Only the server owner or members with **Manage Server** can change the public rank-card appearance.'});
   if(sub==='daily')return respondSandDaily(interaction);
   if(sub==='pay')return respondSandPay(interaction);
   if(sub==='backup'){
    const guild=await interaction.guild.fetch().catch(()=>null);
    if(!guild||guild.ownerId!==interaction.user.id)return InteractionHelper.safeEditReply(interaction,{
     content:'🔒 Only the verified server owner can export inventory backups.'});
    const {server:state,backup:health}=await getSandInventoryProtectedSnapshot(interaction.client,guild.id);
    const exported={format:'beacon-sandcoins-inventory-v1',serverId:guild.id,
     exportedAt:new Date().toISOString(),revision:health.revision,
     verifiedRecoveries:health.recoveryCount,
     items:[...state.inventory],equipped:{...state.equipped},
     purchases:state.purchases,tradeHistory:state.tradeHistory,
     note:'Reference export only. Never import/replay purchases or traded items without reconciling global trade history.'};
    const file=new AttachmentBuilder(Buffer.from(JSON.stringify(exported,null,2)),{
     name:'beacon-inventory-'+guild.id+'-rev'+health.revision+'.json'});
    return InteractionHelper.safeEditReply(interaction,{
     content:'🛡️ **Inventory export saved!** Revision **'+health.revision+
       '** • **'+health.copies+'** verified PostgreSQL recovery snapshots. '+
       'Keep this file private and store it outside Railway. Full database-loss recovery requires an external backup and careful trade-history review.',
     files:[file],allowedMentions:{parse:[]},
    });
   }
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
       (h.delta>=0?'🟢 +':'🔴 ')+format(h.delta)+' • '+(h.kind==='quest'?'Quest reward':h.kind==='daily'?'Daily streak reward':h.kind==='payment_sent'?'Payment sent':h.kind==='payment_received'?'Payment received':'Rank-card purchase')).join('\n'):'No transactions yet.'},
     ],color:'primary',footer:'Beacon • Sand Coins • Daily claims reset at 00:00 UTC',
    })]});
   }
   if(sub==='shop'){
    // Public browsing; previews are globally handled and survive deploys.
    const panel=await buildSandShopPanel(interaction.client,interaction.guildId,interaction.guild.name);
    return InteractionHelper.safeEditReply(interaction,panel);
   }
   if(sub==='inventory'){
    const {server,backup:saved}=await getSandInventoryProtectedSnapshot(interaction.client,interaction.guildId);
    const savedFields=ownedDescription(server);
    savedFields.push({name:'🛡️ Protected PostgreSQL Save',value:
     '**'+saved.items+' items** • revision **'+saved.revision+'** • **'+
     saved.copies+'** verified recovery snapshot(s)\nLast saved: <t:'+
     Math.floor(Date.parse(saved.savedAt)/1000)+':R>\n'+
     'Only the server owner can export a private copy with /sandcoins backup.'+
     (saved.recoveryCount?'\nVerified recoveries: **'+saved.recoveryCount+'**':'')});
    return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
     title:'🎨 '+short(interaction.guild.name)+' • Rank-Card Inventory',
     description:'These items belong to **this server** and persist across bot restarts. '+
      '**Only the owner or Manage Server admins** can equip them.\n\n'+
      'Selected items appear on /progression → Share Rank Card.',
     fields:savedFields,color:'primary',
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
     result.error==='PURCHASE_ID_REUSED'?'⚠️ This purchase request was already used for another item. No coins were spent.':
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
      {name:'🛡️ Inventory Save',value:'Committed to PostgreSQL + recovery vault (revision **'+result.saveRevision+'**).'},
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
    return InteractionHelper.safeEditReply(interaction,{content:'✅ Equipped **'+name(item)+'** in the **'+item.type+'** slot for this server\'s rank card. 🛡️ Saved as inventory revision **'+result.saveRevision+'**.'});
   }
   if(sub==='unequip'){
    const slot=interaction.options.getString('slot',true);
    const saved=await equipSandDecoration(interaction.client,{guildId:interaction.guildId,itemId:null,slot,actorId:interaction.user.id});
    return InteractionHelper.safeEditReply(interaction,{content:'✅ Removed the **'+slot+'** decoration from this server\'s rank card. The purchased item stays in its inventory. 🛡️ Saved revision **'+saved.saveRevision+'**.'});
   }
  }catch(err){
   logger.error('Sand Coins command failed',{guildId:interaction.guildId,sub,error:err.message});
   if(/inventory\/vault disagreement|vault checksum|inventory is malformed|inventory contains duplicate|vault metadata invalid|vault snapshot invalid/.test(err.message))
    return InteractionHelper.safeEditReply(interaction,{content:
     '🛡️ **Inventory Safety Lock** — Beacon detected a mismatch in saved data and stopped this action to protect your items. No inventory overwrite was performed. Contact Beacon support with this server ID: `'+interaction.guildId+'`.'});
   return InteractionHelper.safeEditReply(interaction,{content:
    '⚠️ Sand Coins could not verify this action. Check your wallet or inventory before retrying, then contact Beacon support if needed.'});
  }
 },
};
