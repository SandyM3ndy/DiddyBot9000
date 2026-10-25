import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from './interactionHelper.js';
import { createEmbed } from './embeds.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { resolveLogChannel } from '../services/loggingService.js';
import { logger } from './logger.js';
import {
 getSandWallet,transferSandCoins,getSandCatalogItem,
 getSandTrade,getSandServerTradeOffers,offerSandTrade,resolveSandTrade,deliverSandTradeLogs,
} from '../services/sandCoinsService.js';

const format=n=>n.toLocaleString('en-US')+' SC';
const title=id=>getSandCatalogItem(id)?.name||id;
const reply=(interaction,content)=>InteractionHelper.safeEditReply(interaction,{content,components:[],allowedMentions:{parse:[]}});
const short=id=>String(id).replace(/[^0-9]/g,'').slice(0,20);
const tradeId=value=>/^\d{17,20}$/.test(String(value||''));

async function guildById(client,id){
 if(!tradeId(id))return null;
 // Check current ownership against Discord, not only a potentially stale cache.
 try{
  const cached=client.guilds.cache.get(id);
  return cached?.fetch ? await cached.fetch() : await client.guilds.fetch({guild:id,force:true});
 }catch{return null;}
}
async function auditChannel(client,guild){
 const config=await getGuildConfig(client,guild.id);
 const id=resolveLogChannel(config,'audit');
 if(!id)return null;
 const channel=guild.channels.cache.get(id)||await guild.channels.fetch(id).catch(()=>null);
 const me=guild.members.me||await guild.members.fetchMe().catch(()=>null);
 if(!channel?.send||!me||!channel.permissionsFor(me)?.has([
  PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks
 ]))return null;
 return channel;
}
async function notifyTradeServers(client,offer){
 for(const id of [offer.fromGuildId,offer.toGuildId]){
  await deliverSandTradeLogs(client,id).catch(error=>logger.warn('Trade log queued for retry',
   {guildId:id,error:error.message}));
 }
}
export async function respondSandPay(interaction){
 const recipient=interaction.options.getUser('member',true);
 const amount=interaction.options.getInteger('amount',true);
 if(recipient.bot||recipient.id===interaction.user.id)return reply(interaction,
  '⚠️ You can only pay another real member, not yourself or a bot.');
 const member=await interaction.guild.members.fetch(recipient.id).catch(()=>null);
 if(!member)return reply(interaction,'⚠️ That person must be a member of this server.');
 if(!Number.isSafeInteger(amount)||amount<1||amount>10000)
  return reply(interaction,'⚠️ Transfers must be between 1 and 10,000 Sand Coins.');
 const wallet=await getSandWallet(interaction.client,interaction.user.id);
 if(wallet.balance<amount)return reply(interaction,'⚠️ You only have **'+format(wallet.balance)+'**.');
 const yes='sandpay_confirm_'+interaction.id, no='sandpay_cancel_'+interaction.id;
 const buttons=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(yes).setLabel('Confirm payment').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(no).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
 );
 await InteractionHelper.safeEditReply(interaction,{
  embeds:[createEmbed({title:'🪙 Confirm Sand Coins Payment',
   description:'Pay **'+format(amount)+'** to <@'+recipient.id+'>?\n\n**Payments are final.** This uses your global wallet and will not affect the recipient\'s lifetime-earned ranking.',
   color:'warning',footer:'Only you can confirm • Expires in 60 seconds'})],
  components:[buttons],allowedMentions:{parse:[]},
 });
 const message=await interaction.fetchReply();
 let pressed;
 try{
  pressed=await message.awaitMessageComponent({filter:component=>
   component.user.id===interaction.user.id&&[yes,no].includes(component.customId),time:60000});
 }catch{
  return reply(interaction,'⌛ Payment confirmation expired. No coins were sent.');
 }
 await pressed.deferUpdate();
 if(pressed.customId===no)return reply(interaction,'✅ Payment cancelled. Your coins are untouched.');
 const result=await transferSandCoins(interaction.client,{
  fromId:interaction.user.id,toId:recipient.id,amount,transferId:interaction.id,
 });
 if(result.error)return reply(interaction,
  result.error==='INSUFFICIENT_FUNDS'?'⚠️ Your balance changed; not enough coins remain. Nothing was sent.':
  '⚠️ Payment could not be completed.');
 return InteractionHelper.safeEditReply(interaction,{
  content:'✅ Sent **'+format(amount)+'** to <@'+recipient.id+'>! Your balance: **'+format(result.fromBalance)+'**.',
  embeds:[],components:[],allowedMentions:{parse:[]},
 });
}

export async function respondSandTrade(interaction){
 const client=interaction.client;
 const home=await guildById(client,interaction.guildId);
 if(!home)return reply(interaction,'⚠️ Unable to confirm the current server owner with Discord. Try again.');
 if(interaction.user.id!==home.ownerId)return reply(interaction,
  '🔒 **Only the actual server owner** can create, accept, decline, cancel or view server-inventory trades.');
 const sub=interaction.options.getSubcommand();
 if(sub==='inbox'){
  const offers=await getSandServerTradeOffers(client,home.id);
  const visible=offers.filter(o=>o.fromGuildId===home.id||o.toGuildId===home.id);
  return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
   title:'🔄 Server Inventory Trade Offers',
   description:visible.length?visible.slice(0,10).map(o=>{
    const direction=o.toGuildId===home.id?'📥 INCOMING':'📤 OUTGOING';
    const other=o.toGuildId===home.id?o.fromGuildId:o.toGuildId;
    return '**'+direction+' • '+o.id+'**\nServer: `'+other+'` • '+title(o.offeredItem)+
      ' ↔ '+title(o.requestedItem)+'\nExpires: <t:'+Math.floor(o.expiresAt/1000)+':R>';
   }).join('\n\n'):'No pending trade offers for this server.',
   footer:'Accept or decline incoming offers using /sandcoins trade • Owners only',
   color:'info',
  })],allowedMentions:{parse:[]}});
 }
 if(sub==='offer'){
  const targetId=interaction.options.getString('server',true).trim();
  const offeredItem=interaction.options.getString('give',true);
  const requestedItem=interaction.options.getString('want',true);
  const target=await guildById(client,targetId);
  if(!target||target.id===home.id)return reply(interaction,
   '⚠️ The destination must be a **different server that currently has Beacon installed**. Supply its server ID.');
  if(!target.ownerId||!home.ownerId)return reply(interaction,'⚠️ Could not verify both server owners.');
  // Both logs must be operational BEFORE accepting any inventory trade request.
  const [fromAudit,toAudit]=await Promise.all([auditChannel(client,home),auditChannel(client,target)]);
  if(!fromAudit||!toAudit)return reply(interaction,
   '⚠️ Both servers must have working audit/log channels configured in /dashboard. Beacon needs View Channel, Send Messages and Embed Links in each.');
  const result=await offerSandTrade(client,{tradeId:interaction.id,fromGuildId:home.id,toGuildId:target.id,
   fromOwnerId:home.ownerId,toOwnerId:target.ownerId,offeredItem,requestedItem});
  if(result.error){
   const messages={OFFER_NOT_OWNED:'Your server does not own the offered item.',
    REQUEST_NOT_OWNED:'The destination server does not own the requested item.',
    DUPLICATE_INVENTORY:'A destination server already owns the item it would receive.',
    TOO_MANY_OFFERS:'One of these servers has too many active offers. Close existing offers first.',
    DUPLICATE_TRADE:'This offer was already created.'};
   return reply(interaction,'⚠️ '+(messages[result.error]||result.error));
  }
  await notifyTradeServers(client,result.offer);
  return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
   title:'📤 Inventory Trade Offered',
   description:'**'+home.name+'** offers **'+title(offeredItem)+'** to **'+target.name+
    '** in exchange for **'+title(requestedItem)+'**.\n\nThe other server\'s owner must accept from their own server. No items have moved.',
   fields:[{name:'Trade ID',value:interaction.id},
    {name:'Expires',value:'<t:'+Math.floor(result.offer.expiresAt/1000)+':R>'}],
   color:'warning',footer:'Both owners must approve • No coins involved',
  })],allowedMentions:{parse:[]}});
 }
 const id=interaction.options.getString('id',true).trim();
 if(!tradeId(id))return reply(interaction,'⚠️ Enter the full numeric Trade ID.');
 const offer=await getSandTrade(client,id);
 if(!offer||![offer.fromGuildId,offer.toGuildId].includes(home.id))
  return reply(interaction,'⚠️ Trade not found for this server.');
 if(sub==='status')return InteractionHelper.safeEditReply(interaction,{embeds:[createEmbed({
  title:'🔄 Sand Coins Trade #'+id,
  description:'**Status:** '+offer.status+'\n**From:** '+offer.fromGuildId+
   '\n**To:** '+offer.toGuildId+'\n**Offered:** '+title(offer.offeredItem)+
   '\n**Requested:** '+title(offer.requestedItem)+
   '\n**Expiration:** <t:'+Math.floor(offer.expiresAt/1000)+':F>',
  color:'info',
 })]});
 const source=await guildById(client,offer.fromGuildId);
 const target=await guildById(client,offer.toGuildId);
 if(!source||!target)return reply(interaction,'⚠️ Both servers must still have Beacon installed.');
 if(!source.ownerId||!target.ownerId)return reply(interaction,'⚠️ Could not verify current server ownership.');
 if(sub==='accept'){
  const [a,b]=await Promise.all([auditChannel(client,source),auditChannel(client,target)]);
  if(!a||!b)return reply(interaction,'⚠️ Both servers need working audit/log channels before accepting this trade.');
 }
 const result=await resolveSandTrade(client,{tradeId:id,actorId:interaction.user.id,
  actingGuildId:home.id,fromOwnerId:source.ownerId,toOwnerId:target.ownerId,decision:sub});
 if(result.error){
  const messages={TRADE_NOT_PENDING:'This trade has already been closed.',
   OWNERSHIP_CHANGED:'A server changed owners. This trade is no longer safe; a new offer is required.',
   OWNER_ONLY:'Only the correct server owner can perform this trade action.',
   TRADE_EXPIRED:'This offer has expired. Nothing was transferred.',
   INVENTORY_CHANGED:'The inventory changed since this trade was offered; nothing was transferred.',
   DUPLICATE_INVENTORY:'This trade would create a duplicate item in a server inventory.',
   TRADE_NOT_FOUND:'Trade not found.'};
  return reply(interaction,'⚠️ '+(messages[result.error]||result.error));
 }
 await notifyTradeServers(client,result.offer);
 return reply(interaction,sub==='accept'?
  '✅ **Trade complete!** '+title(offer.offeredItem)+' ↔ '+title(offer.requestedItem)+
  ' were swapped atomically between the two server inventories. Equipped items were safely unequipped.':
  '✅ Trade **'+(sub==='cancel'?'cancelled':'declined')+'**. Neither inventory was changed.');
}
