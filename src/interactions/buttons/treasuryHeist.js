import {MessageFlags,PermissionFlagsBits} from 'discord.js';
import {buildHeistPanel,buildHeistChallenge,startHeistTicker,stopHeistTicker,heistOutcome} from '../../commands/Community/heist.js';
import {createTreasuryHeist,resolveTreasuryHeist,getTreasury} from '../../services/treasuryService.js';
import {logger} from '../../utils/logger.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { resolveLogChannel } from '../../services/loggingService.js';
function manager(i){return i.guild?.ownerId===i.user.id||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);}
async function reportRaid(i,result){
 try{
  const config=await getGuildConfig(i.client,i.guildId);
  const channel=i.guild?.channels?.cache?.get(resolveLogChannel(config,'audit'));
  await channel?.send?.({content:result.success?
   '🏆 **Treasury heist won!** '+result.amount+' SC transferred from **'+result.targetName+'**.':
   '🚨 **Treasury heist failed!** Your server lost '+result.amount+' SC (3% penalty).',
   allowedMentions:{parse:[]}});
 }catch(error){logger.warn('Treasury heist audit delivery failed',{error:error.message});}
}
export async function handleHeistDashboard(i,c,launch=false){
 if(!i.guildId)return i.reply({content:'Use /heist in a server.',flags:MessageFlags.Ephemeral});
 if(launch&&!manager(i))return i.reply({content:'Only the server owner or administrators can launch treasury heists.',
  flags:MessageFlags.Ephemeral});
 await i.deferUpdate();
 try{
  if(!launch)return i.editReply(await buildHeistPanel(c,i.guildId));
  const r=await createTreasuryHeist(c,{guildId:i.guildId,actorId:i.user.id,raidId:i.id});
  const payload=buildHeistChallenge(r.raid,r.targetName,r.defence);
  await i.editReply(payload);
  // Animated public panel. Server-side timestamps remain authoritative.
  startHeistTicker(i.message,c,i.guildId,r.raid,r.targetName,r.defence);
 }catch(error){
  logger.warn('Heist launch failed',{guildId:i.guildId,error:error.message});
  const reasons={NO_ELIGIBLE_TARGETS:'No eligible, unshielded server treasury is available to raid.',
   HEIST_NOT_ELIGIBLE:'Enable heists with at least 500 SC in your treasury first.',
   HEIST_COOLDOWN:'Your server has a 24-hour raid cooldown.',
   HEIST_COOLDOWN_OR_INELIGIBLE:'Your server is not currently eligible to raid.'};
  return i.followUp({content:'⚠️ '+(reasons[error.message]||'Could not start a treasury raid.'),
   flags:MessageFlags.Ephemeral});
 }
}
export async function handleHeistHit(i,c,args=[]){
 if(!i.guildId)return i.reply({content:'Invalid heist.',flags:MessageFlags.Ephemeral});
 const [raidId,columnText]=args,column=Number(columnText);
 const state=await getTreasury(c,i.guildId);
 if(!state.raid||state.raid.id!==raidId||state.raid.actorId!==i.user.id)
  return i.reply({content:'Only the member who started this raid can hit the wall.',
   flags:MessageFlags.Ephemeral});
 if(!['0','1','2'].includes(columnText))return i.reply({content:'Invalid wall choice.',flags:MessageFlags.Ephemeral});
 await i.deferUpdate();
 try{
  const result=await resolveTreasuryHeist(c,{guildId:i.guildId,raidId,actorId:i.user.id,column});
  stopHeistTicker(raidId);
  await i.editReply(heistOutcome(result));
  if(!result.duplicate)await reportRaid(i,result);
 }catch(error){
  logger.warn('Heist resolution failed',{guildId:i.guildId,error:error.message});
  return i.followUp({content:'⚠️ Failed to resolve raid. Treasury balances remain protected by the database.',
   flags:MessageFlags.Ephemeral});
 }
}
export default [
 {name:'heist_launch',execute:(i,c)=>handleHeistDashboard(i,c,true)},
 {name:'heist_refresh',execute:(i,c)=>handleHeistDashboard(i,c,false)},
 {name:'heist_hit',execute:handleHeistHit},
];
