import { MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import {
 getSandWallet,getSandServer,getSandCatalogItem,getSandLimitedStock,
 buySandDecoration,equipSandDecoration,deliverSandPurchaseLogs,
 claimSandDaily,setSandNotificationPreference,SAND_NOTIFICATION_TYPES,
} from '../../services/sandCoinsService.js';
import { sendSandEconomyNotice } from '../../services/sandEconomyNotifications.js';
import { buildSandWalletPanel,SAND_HISTORY_FILTERS } from '../../utils/sandEconomyUi.js';
import { verifyAuditChannel } from '../../commands/Community/sandcoins.js';
import { logger } from '../../utils/logger.js';

const money=n=>Number(n||0).toLocaleString('en-US')+' SC';
const privateReply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
function manager(i){return i.guild?.ownerId===i.user.id||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);}
const button=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
export async function handleSandWalletButton(i,client,args=[]){
 if(!i.guildId)return privateReply(i,'Use /sandcoins wallet inside a Beacon server.');
 const action=args[0];
 await i.deferUpdate();
 try{
  if(action==='daily'){
   const result=await claimSandDaily(client,{userId:i.user.id});
   const panel=await buildSandWalletPanel(client,i.user.id);
   return i.editReply({...panel,content:result.claimed?'✅ Claimed **+'+money(result.amount)+'** for your global wallet!':'⌛ Already claimed today. Next reset <t:'+result.nextClaimAt+':R>.'});
  }
  if(action==='toggle'){
   const type=args[1];
   if(!SAND_NOTIFICATION_TYPES.includes(type))return i.editReply({content:'Unknown notification setting.',components:[]});
   const w=await getSandWallet(client,i.user.id);
   const enabled=!Boolean(w.notifications?.[type]);
   await setSandNotificationPreference(client,i.user.id,type,enabled);
   const panel=await buildSandWalletPanel(client,i.user.id,'alerts');
   return i.editReply({...panel,content:(enabled?'✅ Enabled ':'🔕 Disabled ')+type+' notifications.'});
  }
  if(action==='shop'){
   const {buildSandShopPanel}=await import('../../commands/Community/sandcoins.js');
   return i.editReply({...await buildSandShopPanel(client,i.guildId,i.guild.name),content:''});
  }
  if(action==='history'){
   const filter=SAND_HISTORY_FILTERS.includes(args[1])?args[1]:'all';
   const page=/^\d{1,2}$/.test(args[2]||'')?Number(args[2]):0;
   return i.editReply({...await buildSandWalletPanel(client,i.user.id,'history',filter,page),content:''});
  }
  return i.editReply({...await buildSandWalletPanel(client,i.user.id,action==='alerts'?'alerts':'home'),content:''});
 }catch(error){
  logger.warn('Sand Coins wallet interaction failed',{guildId:i.guildId,error:error.message});
  return i.editReply({content:'⚠️ Could not update your wallet. Your balance has not been changed by this view.',components:[]}).catch(()=>{});
 }
}
export async function handleSandShopPurchase(i,client,args=[],action='buy'){
 if(!i.guildId)return privateReply(i,'Open the Sand Coins shop inside a server.');
 const itemId=action==='buy'?args[0]:args[1],item=getSandCatalogItem(itemId);
 if(!item)return privateReply(i,'That decoration is not currently for sale.');
 if(action==='buy'){
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const [wallet,server,stock]=await Promise.all([
    getSandWallet(client,i.user.id),getSandServer(client,i.guildId),getSandLimitedStock(client,itemId)]);
   if(server.inventory.includes(itemId))return i.editReply({content:'✅ Your server already owns **'+item.name+'**. A manager can equip it from /sandcoins equip.'});
   if(stock&&stock.remaining<=0)return i.editReply({content:'🚫 This limited edition is sold out. No coins spent.'});
   if(wallet.balance<item.price)return i.editReply({content:'🪙 You need **'+money(item.price)+'** and only have **'+money(wallet.balance)+'**. No coins spent.'});
   const purchaseId=i.id,base='sand_shop_confirm:'+i.user.id+':'+itemId+':'+purchaseId;
   return i.editReply({
    embeds:[createEmbed({title:'🪙 Confirm Rank-Card Purchase',
     description:'Purchase **'+item.name+'** for **'+i.guild.name+'**?\n\n**Price:** '+money(item.price)+
      '\n**Your balance:** '+money(wallet.balance)+'\n**After purchase:** '+money(wallet.balance-item.price)+
      '\n\nThis item belongs to the **server**, not your personal inventory. Purchases cannot be undone.',
     color:'warning',footer:'Only you can confirm • This confirmation expires after 10 minutes'})],
    components:[new ActionRowBuilder().addComponents(
     button(base,'Confirm purchase',ButtonStyle.Success),
     button('sand_shop_cancel:'+i.user.id,'Cancel'))],allowedMentions:{parse:[]},
   });
  }catch(error){logger.warn('Sand shop buy preview failed',{error:error.message});return i.editReply({content:'⚠️ Purchase preview unavailable. No coins spent.'});}
 }
 const ownerId=args[0];
 if(ownerId!==i.user.id)return privateReply(i,'This purchase confirmation belongs to another user.');
 if(action==='cancel')return i.update({content:'✅ Purchase cancelled. No coins spent.',embeds:[],components:[]});
 if(action==='equip'){
  if(!manager(i))return privateReply(i,'Only the owner or Manage Server administrators can equip cosmetics.');
  await i.deferUpdate();
  try{
   const result=await equipSandDecoration(client,{guildId:i.guildId,itemId,slot:item.type,actorId:i.user.id});
   return i.editReply({content:result.error?'⚠️ Item is not owned by this server.':'✅ Equipped **'+item.name+'** on this server’s rank card.',components:[],embeds:[]});
  }catch(error){logger.warn('Shop equip failed',{error:error.message});return i.editReply({content:'⚠️ Could not equip this item. Inventory has not been changed.',components:[],embeds:[]});}
 }
 if(action!=='confirm')return privateReply(i,'Invalid purchase action.');
 const purchaseId=args[2];
 if(!/^\d{17,20}$/.test(String(purchaseId)))return privateReply(i,'Invalid purchase confirmation.');
 const issuedAt=Number(BigInt(purchaseId)>>22n)+1420070400000;
 if(Date.now()-issuedAt>10*60*1000||issuedAt>Date.now()+60000)
  return i.update({content:'⌛ Purchase confirmation expired. Open the item preview and try again.',embeds:[],components:[]});
 await i.deferUpdate();
 try{
  const audit=await verifyAuditChannel(i);
  if(audit.error)return i.editReply({content:'⚠️ '+audit.error,embeds:[],components:[]});
  const result=await buySandDecoration(client,{userId:i.user.id,guildId:i.guildId,itemId,purchaseId});
  if(result.error){
   const message=result.error==='ALREADY_OWNED'?'Server already owns this decoration.':
    result.error==='SOLD_OUT'?'Limited edition sold out.':
    result.error==='INSUFFICIENT_FUNDS'?'Not enough coins left in your wallet.':'Purchase confirmation could not be completed.';
   return i.editReply({content:'⚠️ '+message+' No additional coins spent.',embeds:[],components:[]});
  }
  const logs=await deliverSandPurchaseLogs(client,i.guildId).catch(error=>{
   logger.warn('Shop purchase audit pending',{guildId:i.guildId,error:error.message});
   return {pending:true};
  });
  if(!result.duplicate&&i.guild.ownerId&&i.guild.ownerId!==i.user.id){
   await sendSandEconomyNotice(client,i.guild.ownerId,'purchases',
    '🎨 **Beacon Economy** — '+item.name+' was purchased for **'+i.guild.name+'** by <@'+i.user.id+'>.');
  }
  const components=manager(i)?[new ActionRowBuilder().addComponents(
   button('sand_shop_equip:'+i.user.id+':'+item.id,'Equip on Server',ButtonStyle.Success))]:[];
  return i.editReply({content:'✅ **'+item.name+' purchased for '+i.guild.name+'!**\nPaid: **'+money(item.price)+
   '** • Your remaining balance: **'+money(result.balance)+'**\n🛡️ Inventory save revision: **'+result.saveRevision+
   '** • Audit: '+(logs?.pending||logs?.error?'queued':'logged')+
   (manager(i)?'\nYou can equip it below.':'\nA server manager can equip it with /sandcoins equip.'),
   embeds:[],components,allowedMentions:{parse:[]}});
 }catch(error){
  logger.error('Sand shop confirmed purchase failed',{guildId:i.guildId,error:error.message});
  return i.editReply({content:'⚠️ Beacon could not verify the purchase. Check /sandcoins wallet and /sandcoins inventory before trying again.',embeds:[],components:[]}).catch(()=>{});
 }
}
export default [
 {name:'sand_wallet',execute:(i,c,args)=>handleSandWalletButton(i,c,args)},
 {name:'sand_shop_buy',execute:(i,c,args)=>handleSandShopPurchase(i,c,args,'buy')},
 {name:'sand_shop_confirm',execute:(i,c,args)=>handleSandShopPurchase(i,c,args,'confirm')},
 {name:'sand_shop_cancel',execute:(i,c,args)=>handleSandShopPurchase(i,c,args,'cancel')},
 {name:'sand_shop_equip',execute:(i,c,args)=>handleSandShopPurchase(i,c,args,'equip')},
];
