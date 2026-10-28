import { settlePendingSandPayouts } from './serverProgressionService.js';
import { deliverSandPurchaseLogs, deliverSandTradeLogs, getSandServer } from './sandCoinsService.js';
import { logger } from '../utils/logger.js';
import { maintainSandEconomyNotices } from './sandEconomyNotifications.js';

let started=false;
export async function maintainSandCoins(client){
 if(!client?.db?.isAvailable?.())return;
 for(const guild of client.guilds?.cache?.values?.()||[]){
  // Backups are essential; failing rewards/logs cannot prevent protection.
  let state;
  try{
   state=await getSandServer(client,guild.id);
  }catch(error){
   logger.error('Sand Coins inventory integrity check failed; records untouched',
    {guildId:guild.id,error:error.message});
   continue;
  }
  try{await settlePendingSandPayouts(client,guild.id);}
  catch(error){logger.warn('Pending quest payouts retained',{guildId:guild.id,error:error.message});}
  if(state.pendingLogs.length){
   try{await deliverSandPurchaseLogs(client,guild.id);}
   catch(error){logger.warn('Purchase audits retained',{guildId:guild.id,error:error.message});}
  }
  if(state.pendingTradeLogs.length){
   try{await deliverSandTradeLogs(client,guild.id);}
   catch(error){logger.warn('Trade audits retained',{guildId:guild.id,error:error.message});}
  }
 }
 try{await maintainSandEconomyNotices(client);}
 catch(error){logger.warn('Economy notifications sweep deferred',{error:error.message});}
}
/** Replays saved coin claims and audit logs after restarts and outages. */
export function startSandCoinsMaintenance(client){
 if(started)return;
 started=true;
 const begin=setTimeout(()=>maintainSandCoins(client).catch(err=>
  logger.warn('Sand Coins startup reconciliation failed',{error:err.message})),15_000);
 begin.unref?.();
 const timer=setInterval(()=>maintainSandCoins(client).catch(err=>
  logger.warn('Sand Coins periodic reconciliation failed',{error:err.message})),5*60_000);
 timer.unref?.();
}
