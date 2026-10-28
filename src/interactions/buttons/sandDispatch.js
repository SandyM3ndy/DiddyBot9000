import { MessageFlags } from 'discord.js';
import {
 getDispatchStatus,startDispatch,answerDispatch,abandonDispatch,
} from '../../services/beaconDispatchService.js';
import { buildDispatchBoard,buildDispatchMission,buildDispatchResult } from '../../utils/beaconDispatchUi.js';
import { logger } from '../../utils/logger.js';

const ownerNotice=(i)=>i.reply({
 content:'🔒 This contractor assignment belongs to another user. Open /sandcoins dispatch to start your own.',
 flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
});
export async function handleBeaconDispatch(i,client,args=[]){
 if(!i.guildId)return i.reply({content:'Use /sandcoins dispatch in a Beacon server.',
  flags:MessageFlags.Ephemeral});
 const action=args[0]||'board';
 if(action==='pick'&&args[1]!==i.user.id)return ownerNotice(i);
 if(!['board','start','resume','abandon','pick'].includes(action))
  return i.reply({content:'Unknown Dispatch action. Reopen /sandcoins dispatch.',flags:MessageFlags.Ephemeral});
 await i.deferUpdate();
 try{
  const userId=i.user.id,now=new Date();
  if(action==='start'){
   const started=await startDispatch(client,{userId,difficulty:args[1],now});
   if(started.status==='STARTED')return i.editReply(buildDispatchMission(started.profile,userId));
   return i.editReply(buildDispatchBoard(started.profile||await getDispatchStatus(client,userId,now),
    now,'Assignment unavailable. Your wallet has not changed.'));
  }
  if(action==='pick'){
   const step=Number(args[3]),choice=Number(args[4]);
   if(!/^\d+$/.test(args[3]||'')||!/^[012]$/.test(args[4]||''))
    return i.editReply(buildDispatchBoard(await getDispatchStatus(client,userId,now),now,
     'Invalid response. Nothing was charged.'));
   const response=await answerDispatch(client,{userId,token:args[2],step,choice,now});
   if(response.status==='COMPLETE')return i.editReply(buildDispatchResult(response.profile,response.result));
   if(response.status==='NEXT')return i.editReply(buildDispatchMission(response.profile,userId,response.feedback));
   return i.editReply(buildDispatchBoard(response.profile,now,'That answer was expired or already recorded. No additional payout.'));
  }
  if(action==='abandon'){
   const response=await abandonDispatch(client,{userId,token:args[1],now});
   return i.editReply(buildDispatchBoard(response.profile,now,
    response.status==='ABANDONED'?'Assignment abandoned. The start still counts toward the daily limit.':'That assignment is no longer active.'));
  }
  const profile=await getDispatchStatus(client,userId,now);
  if(action==='resume'&&profile.active?.token===args[1])
   return i.editReply(buildDispatchMission(profile,userId));
  return i.editReply(buildDispatchBoard(profile,now,
   action==='resume'?'That assignment expired. You can start another when eligible.':''));
 }catch(error){
  logger.warn('Beacon Dispatch interaction interrupted',{userId:i.user.id,
   guildId:i.guildId,action,error:error.message});
  return i.editReply({content:'⚠️ Dispatch could not complete this action. Your coins are never awarded without a confirmed database transaction. Reopen /sandcoins dispatch to recover the assignment.',
   embeds:[],components:[],allowedMentions:{parse:[]}}).catch(()=>{});
 }
}
export default [{name:'sand_dispatch',execute:(i,client,args)=>handleBeaconDispatch(i,client,args)}];
