import { settlePendingSandPayouts } from './serverProgressionService.js';
import { deliverSandPurchaseLogs, deliverSandTradeLogs, getSandServer } from './sandCoinsService.js';
import { logger } from '../utils/logger.js';

let started=false;
export async function maintainSandCoins(client){
 if(!client?.db?.isAvailable?.())return;
 for(const guild of client.guilds?.cache?.values?.()||[]){
  try{
   await settlePendingSandPayouts(client,guild.id);
   const state=await getSandServer(client,guild.id);
   if(state.pendingLogs.length)await deliverSandPurchaseLogs(client,guild.id);
   if(state.pendingTradeLogs.length)await deliverSandTradeLogs(client,guild.id);
  }catch(error){
   logger.warn('Sand Coins pending work retained',{guildId:guild.id,error:error.message});
  }
 }
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
