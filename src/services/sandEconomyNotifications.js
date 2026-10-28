import { getSandWallet,markSandDailyReminder,SAND_DAILY_REMINDER_INDEX } from './sandCoinsService.js';
import { getTreasury,TREASURY_POTIONS } from './treasuryService.js';
import { logger } from '../utils/logger.js';

const validId=id=>/^\d{17,20}$/.test(String(id||''));
/** All economy notices are opt-in. Notifications never roll back payments. */
export async function sendSandEconomyNotice(client,userId,type,message){
 if(!validId(userId))return false;
 try{
  const wallet=await getSandWallet(client,userId);
  if(wallet.notifications?.[type]!==true)return false;
  const user=await client.users.fetch(userId);
  if(user?.bot)return false;
  await user.send({content:message,allowedMentions:{parse:[]}});
  return true;
 }catch(error){
  logger.debug('Sand Coins optional DM not delivered',{userId,type,error:error.message});
  return false;
 }
}
export async function maintainSandEconomyNotices(client,now=new Date()){
 // Daily nudges are explicitly opted-in; never scan all economy wallets.
 if(now.getUTCHours()>=12){
  const today=now.toISOString().slice(0,10);
  const subscribed=await client.db.get(SAND_DAILY_REMINDER_INDEX,[]);
  if(Array.isArray(subscribed)){
   for(const userId of subscribed.slice(0,400)){
    try{
     if(!validId(userId)||!await markSandDailyReminder(client,userId,today))continue;
     const user=await client.users.fetch(userId);
     await user.send({content:'🔥 **Beacon Daily Streak Reminder** — Your Sand Coins streak is ready to claim! Use /sandcoins daily in any Beacon server before 00:00 UTC to keep it going.',allowedMentions:{parse:[]}});
    }catch(error){logger.debug('Sand Coins daily reminder undelivered',{error:error.message});}
   }
  }
 }
 // A durable receipt prevents duplicate potion-expiry notices across restarts.
 for(const guild of client.guilds?.cache?.values?.()||[]){
  try{
   const state=await getTreasury(client,guild.id);
   for(const [type,potion] of Object.entries(TREASURY_POTIONS)){
    const expires=state.active?.[type]||0;
    if(!expires||expires>now.getTime()||now.getTime()-expires>24*60*60*1000)continue;
    const key='beacon:sandcoins:v1:notifications:potion:'+guild.id+':'+type+':'+expires;
    if(await client.db.get(key,false))continue;
    // Save before DM so concurrent jobs do not spam owners; no funds change.
    await client.db.set(key,true);
    await sendSandEconomyNotice(client,guild.ownerId,'potions',
     '🧪 **Beacon Treasury** — '+potion.name+' has expired in **'+guild.name+'**. Your next boost can be activated through /treasury.');
   }
  }catch(error){logger.debug('Treasury notification check skipped',{guildId:guild.id,error:error.message});}
 }
}
