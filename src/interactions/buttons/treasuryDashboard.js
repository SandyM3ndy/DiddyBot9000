import { MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits } from 'discord.js';
import { buildTreasuryPanel } from '../../commands/Community/treasury.js';
import { treasuryDonate,treasuryPayout,toggleTreasuryHeists,purchaseTreasuryItem,activateTreasuryPotion } from '../../services/treasuryService.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { resolveLogChannel } from '../../services/loggingService.js';

function manager(i){return i.guild?.ownerId===i.user.id||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);}
function owner(i){return i.guild?.ownerId===i.user.id;}
const privateMsg=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral});
const errMessage=err=>({
 INSUFFICIENT_WALLET_BALANCE:'You do not have enough personal Sand Coins.',
 INSUFFICIENT_TREASURY_FUNDS:'Not enough spendable treasury coins. While opted into heists, the 500 SC reserve must remain.',
 HEIST_RESERVE_REQUIRED:'That payout would break your minimum 500 SC heist reserve.',
 TREASURY_CAPACITY_REACHED:'Your treasury is full. Level up your server to raise capacity.',
 MINIMUM_500_TREASURY:'You must have at least 500 Sand Coins in your treasury before opting in.',
 HEIST_TOGGLE_COOLDOWN:'You can only change heist participation once every 24 hours.',
 ACTIVE_HEIST:'You cannot change heist participation while a raid is active.',
 TREASURY_LOCKED_DURING_HEIST:'Treasury balances and defences are locked during an active 12-second raid. Try again when it ends.',
 MAXIMUM_DEFENCE:'Your vault is already fully upgraded.',
 NO_POTION:'No potion of that type is in your treasury inventory.',
 POTION_ALREADY_ACTIVE:'That potion is already active for your server.',
 POTION_INVENTORY_FULL:'Your potion storage is full.',
 INVALID_AMOUNT:'Enter a valid, positive whole amount of Sand Coins.',
}[err.message]||'Treasury action could not be completed. Your funds have not been confirmed as moved.');
async function audit(i,message){
 try{
  const cfg=await getGuildConfig(i.client,i.guildId);
  const channelId=resolveLogChannel(cfg,'audit');
  const channel=i.guild?.channels?.cache?.get(channelId);
  if(channel?.send)await channel.send({content:'🪙 **Beacon Treasury** • '+message,allowedMentions:{parse:[]}});
 }catch(error){logger.warn('Treasury audit message failed',{error:error.message});}
}
async function modal(i,type){
 const form=new ModalBuilder().setCustomId('treasury_form:'+type+':'+i.user.id)
  .setTitle(type==='donate'?'Donate Sand Coins':'Owner Treasury Payout');
 const amount=new TextInputBuilder().setCustomId('amount').setLabel('Sand Coins amount')
  .setPlaceholder('e.g. 250').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7);
 if(type==='payout'){
  const recipient=new TextInputBuilder().setCustomId('recipient').setLabel('Recipient Discord user ID')
   .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
  form.addComponents(new ActionRowBuilder().addComponents(recipient));
 }
 form.addComponents(new ActionRowBuilder().addComponents(amount));
 return i.showModal(form);
}
async function confirm(i,action){
 const labels={toggle:'Change heist participation (24-hour cooldown)',
  upgrade:'Purchase the next defence level with treasury funds',
  buycoins:'Buy 2× Sand Coins potion for 5,000 SC',
  buyxp:'Buy 2× Server XP potion for 7,500 SC',
  usecoins:'Activate 2× Sand Coins for the entire server for 2 hours',
  usexp:'Activate 2× Server XP for the entire server for 2 hours'};
 return i.reply({content:'**Confirm:** '+labels[action]+'?\nThis action will be logged.',
  flags:MessageFlags.Ephemeral,components:[new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('treasury_confirm:'+action+':'+i.user.id)
    .setLabel('Confirm').setStyle(ButtonStyle.Success),
   new ButtonBuilder().setCustomId('treasury_confirm:cancel:'+i.user.id)
    .setLabel('Cancel').setStyle(ButtonStyle.Secondary))]});
}
export async function handleTreasuryButton(i,client,args=[],confirmed=false){
 if(!i.guildId)return privateMsg(i,'Use treasury controls inside a server.');
 const action=args[0],actor=args[1];
 if(confirmed&&actor!==i.user.id)return privateMsg(i,'This confirmation belongs to someone else.');
 if(!confirmed&&['donate','payout'].includes(action)){
  if(action==='payout'&&!owner(i))return privateMsg(i,'Only the server owner can pay members using treasury funds.');
  return modal(i,action);
 }
 if(action==='cancel')return i.update({content:'Cancelled. No treasury funds moved.',components:[]});
 // Modal previews carry no authority to move funds. A second explicit
 // confirmation is required. Message ID is the idempotency transaction key.
 if(confirmed&&['donateamount','payamount'].includes(action)){
  const amountText=args[2],recipientId=args[3];
  if(!/^[1-9]\d{0,6}$/.test(amountText))
   return privateMsg(i,'Invalid transfer amount.');
  if(action==='payamount'&&!owner(i))
   return privateMsg(i,'Only the server owner can make payouts.');
  if(action==='payamount'){
   if(!/^\d{17,20}$/.test(recipientId))return privateMsg(i,'Invalid recipient.');
   const member=await i.guild.members.fetch(recipientId).catch(()=>null);
   if(!member||member.user?.bot)return privateMsg(i,'Recipient is not a valid server member.');
  }
  await i.deferUpdate();
  try{
   const amount=Number(amountText);
   const result=action==='donateamount'
    ?await treasuryDonate(client,{guildId:i.guildId,userId:i.user.id,amount,requestId:i.message.id})
    :await treasuryPayout(client,{guildId:i.guildId,ownerId:i.user.id,recipientId,amount,requestId:i.message.id});
   if(!result.duplicate)await audit(i,(action==='donateamount'?'Donation':'Owner payout')+': '+amount+' SC • <@'+i.user.id+'>');
   return i.editReply({content:'✅ Transfer confirmed: '+amount.toLocaleString()+
    ' SC. Treasury now holds '+result.balance.toLocaleString()+' SC.',components:[],embeds:[]});
  }catch(error){
   logger.warn('Treasury transfer failed',{guildId:i.guildId,error:error.message});
   return i.editReply({content:'⚠️ '+errMessage(error),components:[],embeds:[]});
  }
 }
 if(['payout','toggle'].includes(action)&&!owner(i))return privateMsg(i,'Only the server owner can perform this action.');
 if(['buycoins','buyxp','usecoins','usexp','upgrade'].includes(action)&&!manager(i))
  return privateMsg(i,'Only server administrators or the owner can buy or activate treasury upgrades.');
 const changes=['toggle','buycoins','buyxp','usecoins','usexp','upgrade'];
 if(!confirmed&&changes.includes(action))return confirm(i,action);
 if(!confirmed){
  const view=['home','shop','defence','history','stats'].includes(action)?action:'home';
  const page=view==='history'&&/^\d{1,3}$/.test(args[1]||'')?Number(args[1]):0;
  await i.deferUpdate();
  try{return await i.editReply(await buildTreasuryPanel(client,i.guildId,view,page));}
  catch(error){return i.followUp({content:'Could not refresh the treasury dashboard.',flags:MessageFlags.Ephemeral});}
 }
 if(!changes.includes(action))return privateMsg(i,'Invalid treasury control.');
 await i.deferUpdate();
 try{
  let result;
  if(action==='toggle')result=await toggleTreasuryHeists(client,{guildId:i.guildId,actorId:i.user.id});
  else if(action==='upgrade')result=await purchaseTreasuryItem(client,{
   guildId:i.guildId,actorId:i.user.id,kind:'defence',requestId:i.message.id});
  else if(action==='buycoins'||action==='buyxp')result=await purchaseTreasuryItem(client,{
   guildId:i.guildId,actorId:i.user.id,kind:'potion',itemId:action==='buycoins'?'coins':'xp',requestId:i.message.id});
  else result=await activateTreasuryPotion(client,{
   guildId:i.guildId,actorId:i.user.id,itemId:action==='usecoins'?'coins':'xp'});
  const label=action==='toggle'?(result.enabled?'Heists enabled • 1.2× eligible activity XP bonus':'Heists disabled'):
   action==='upgrade'||action.startsWith('buy')?result.description+' purchased for '+result.price.toLocaleString()+' SC':
   'Server-wide '+(action==='usecoins'?'Sand Coins':'XP')+' boost active for two hours';
  if(!result.duplicate)await audit(i,'**'+label+'** • <@'+i.user.id+'>');
  return await i.editReply({content:'✅ '+label,components:[],embeds:[]});
 }catch(error){
  logger.warn('Treasury confirmed action failed',{guildId:i.guildId,error:error.message});
  return i.editReply({content:'⚠️ '+errMessage(error),components:[],embeds:[]});
 }
}
export async function handleTreasuryForm(i,client,args=[]){
 if(!i.guildId||args[1]!==i.user.id)return privateMsg(i,'Invalid treasury form.');
 const type=args[0];
 if(type!=='donate'&&type!=='payout')return privateMsg(i,'Invalid treasury form.');
 if(type==='payout'&&!owner(i))return privateMsg(i,'Only the server owner can pay members.');
 const number=i.fields.getTextInputValue('amount').trim();
 if(!/^[1-9]\d{0,6}$/.test(number))return privateMsg(i,'Enter a whole positive amount up to 1,000,000.');
 const amount=Number(number);
 let recipientId=null;
 if(type==='payout'){
  recipientId=i.fields.getTextInputValue('recipient').trim();
  if(!/^\d{17,20}$/.test(recipientId))return privateMsg(i,'Enter a valid Discord user ID.');
  const user=await i.guild.members.fetch(recipientId).catch(()=>null);
  if(!user||user.user?.bot)return privateMsg(i,'Recipient must be a non-bot member of this server.');
 }
 const action=type==='donate'?'donateamount':'payamount';
 return i.reply({content:'**Confirm the treasury transfer:**\n'+
  (type==='donate'?'Donate **'+amount.toLocaleString()+' SC** from your wallet to this server.':
   'Pay **'+amount.toLocaleString()+' SC** from the shared treasury to <@'+recipientId+'>.')+
  '\nFunds only move after you press Confirm.',
  flags:MessageFlags.Ephemeral,
  allowedMentions:{parse:[]},
  components:[new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('treasury_confirm:'+action+':'+i.user.id+':'+amount+
    (recipientId?':'+recipientId:'')).setLabel('Confirm Transfer').setStyle(ButtonStyle.Success),
   new ButtonBuilder().setCustomId('treasury_confirm:cancel:'+i.user.id)
    .setLabel('Cancel').setStyle(ButtonStyle.Secondary))]});

}
export default [
 {name:'treasury',execute:(i,c,args)=>handleTreasuryButton(i,c,args,false)},
 {name:'treasury_confirm',execute:(i,c,args)=>handleTreasuryButton(i,c,args,true)},
];
