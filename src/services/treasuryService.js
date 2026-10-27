/**
 * Beacon community treasuries. A separate persistent ledger, sharing the
 * existing Sand Coins PostgreSQL transaction/locking engine for money moves.
 * All prices and cooldowns live here: views never authorise a transfer.
 */
import { randomInt } from 'node:crypto';
import { atomicSandTransaction, sandWalletStorageKey } from './sandCoinsService.js';

export const TREASURY_MIN_HEIST=500;
export const TREASURY_TOGGLE_COOLDOWN_MS=24*60*60*1000;
export const TREASURY_RAID_COOLDOWN_MS=24*60*60*1000;
export const TREASURY_SHIELD_MS=24*60*60*1000;
export const TREASURY_FAILED_SHIELD_MS=3*60*60*1000;
export const TREASURY_RAID_WINDOW_MS=12000;
export const TREASURY_DEFENCES=Object.freeze([
 {level:1,name:'Basic Vault',price:0,chance:60,loot:15},
 {level:2,name:'Reinforced Doors',price:1000,chance:50,loot:12},
 {level:3,name:'Security Network',price:2500,chance:40,loot:9},
 {level:4,name:'Fortified Treasury',price:5000,chance:30,loot:6},
 {level:5,name:'Beacon Stronghold',price:10000,chance:20,loot:3},
]);
export const TREASURY_POTIONS=Object.freeze({
 coins:{name:'2× Sand Coins',price:5000,durationMs:2*60*60*1000},
 xp:{name:'2× Server XP',price:7500,durationMs:2*60*60*1000},
});
const VALID_ID=/^\d{17,20}$/;
export const treasuryStorageKey=id=>'beacon:treasury:v1:'+id;
const transactionKey=id=>'beacon:treasury:tx:'+id;
const clampMoney=n=>Number.isSafeInteger(n)&&n>=0;
// A raid locks both communities' balances and defence for its 12-second window.
// Normal activity resumes as soon as the raid completes or its window expires.
const activeRaid=(state,now=Date.now())=>
 Boolean((state.pending?.endsAt>now)||
 (state.raid?.status==='active'&&state.raid.endsAt>now));
function validId(id){if(!VALID_ID.test(String(id)))throw new Error('INVALID_ID');}
const empty=()=>({
 version:1,balance:0,enabled:false,changedAt:0,defence:1,
 potions:{coins:0,xp:0},active:{coins:0,xp:0},
 shieldUntil:0,raidCooldownUntil:0,pending:null,raid:null,
 donated:0,spent:0,won:0,lost:0,history:[],
});
function parse(raw){
 if(raw===null||raw===undefined)return empty();
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||!clampMoney(raw.balance))
  throw new Error('INVALID_TREASURY_DATA');
 const out={...empty(),...raw,
  potions:{coins:0,xp:0,...raw.potions},active:{coins:0,xp:0,...raw.active}};
 if(!TREASURY_DEFENCES.some(d=>d.level===out.defence)||
    !Object.values(out.potions).every(clampMoney)||
    !Object.values(out.active).every(x=>clampMoney(x))||
    !Array.isArray(out.history))throw new Error('INVALID_TREASURY_DATA');
 out.history=out.history.slice(0,60);
 return out;
}
export function treasuryCapacity(level){
 if(level>=50)return 60000;
 if(level>=30)return 35000;
 if(level>=20)return 20000;
 if(level>=10)return 10000;
 if(level>=5)return 5000;
 return 2500;
}
export async function getTreasury(client,guildId){
 validId(guildId);
 const raw=await client.db.get(treasuryStorageKey(guildId),null);
 const progression=await client.db.get('guild:'+guildId+':progression',null);
 const state=parse(raw);
 return {...state,capacity:treasuryCapacity(progression?.level||1)};
}
export async function getTreasuryEffects(client,guildId,now=Date.now()){
 const state=parse(await client.db.get(treasuryStorageKey(guildId),null));
 const eligible=state.enabled&&state.balance>=TREASURY_MIN_HEIST;
 const xpPotion=state.active.xp>now;
 return {xpMultiplier:Math.min(2,xpPotion?2:eligible?1.2:1),
  sandMultiplier:state.active.coins>now?2:1,eligible};
}
function entry(state,kind,amount,actorId,detail='',now=Date.now()){
 state.history.unshift({kind,amount,actorId,detail,at:now});
 state.history=state.history.slice(0,60);
}
function checks(id,amount){
 validId(id);
 if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)throw new Error('INVALID_AMOUNT');
}
function applyWallet(raw,delta,guildId,kind,now){
 const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?{...raw}:null;
 const wallet=value||{balance:0,lifetime:0,history:[]};
 if(!clampMoney(wallet.balance)||!clampMoney(wallet.lifetime))throw new Error('INVALID_WALLET_DATA');
 if(!clampMoney(wallet.balance+delta))throw new Error('INSUFFICIENT_WALLET_BALANCE');
 wallet.balance+=delta;
 // Treasury payouts return existing currency; do not mint new lifetime earnings.
 wallet.history=[{kind,delta,guildId,at:new Date(now).toISOString()},...(Array.isArray(wallet.history)?wallet.history:[])].slice(0,30);
 return wallet;
}
export async function treasuryDonate(client,{guildId,userId,amount,requestId}){
 checks(guildId,amount);validId(userId);validId(requestId);
 const tk=treasuryStorageKey(guildId),wk=sandWalletStorageKey(userId),ik=transactionKey(requestId);
 const level=(await client.db.get('guild:'+guildId+':progression',null))?.level||1;
 return atomicSandTransaction(client,[tk,wk,ik],async tx=>{
  if(tx.get(ik))return {...tx.get(ik),duplicate:true};
  const state=parse(tx.get(tk));
  if(activeRaid(state))throw new Error('TREASURY_LOCKED_DURING_HEIST');
  if(state.balance+amount>treasuryCapacity(level))throw new Error('TREASURY_CAPACITY_REACHED');
  const wallet=applyWallet(tx.get(wk),-amount,guildId,'treasury_donation',Date.now());
  state.balance+=amount;state.donated+=amount;entry(state,'donation',amount,userId);
  const result={balance:state.balance,walletBalance:wallet.balance,amount};
  tx.put(wk,wallet);tx.put(tk,state);tx.put(ik,result);
  return result;
 });
}
export async function treasuryPayout(client,{guildId,ownerId,recipientId,amount,requestId}){
 checks(guildId,amount);validId(ownerId);validId(recipientId);validId(requestId);
 const tk=treasuryStorageKey(guildId),wk=sandWalletStorageKey(recipientId),ik=transactionKey(requestId);
 return atomicSandTransaction(client,[tk,wk,ik],async tx=>{
  if(tx.get(ik))return {...tx.get(ik),duplicate:true};
  const state=parse(tx.get(tk));
  if(activeRaid(state))throw new Error('TREASURY_LOCKED_DURING_HEIST');
  if(amount>state.balance)throw new Error('INSUFFICIENT_TREASURY_FUNDS');
  if(state.enabled&&state.balance-amount<TREASURY_MIN_HEIST)
   throw new Error('HEIST_RESERVE_REQUIRED');
  const wallet=applyWallet(tx.get(wk),amount,guildId,'treasury_payout',Date.now());
  state.balance-=amount;
  entry(state,'owner_payout',-amount,ownerId,recipientId);
  const result={balance:state.balance,walletBalance:wallet.balance,amount,recipientId};
  tx.put(tk,state);tx.put(wk,wallet);tx.put(ik,result);
  return result;
 });
}
export async function toggleTreasuryHeists(client,{guildId,actorId,now=Date.now()}){
 validId(guildId);validId(actorId);
 const tk=treasuryStorageKey(guildId);
 return atomicSandTransaction(client,[tk],async tx=>{
  const state=parse(tx.get(tk));
  if(now-state.changedAt<TREASURY_TOGGLE_COOLDOWN_MS)throw new Error('HEIST_TOGGLE_COOLDOWN');
  if(activeRaid(state,now))throw new Error('ACTIVE_HEIST');
  if(!state.enabled&&state.balance<TREASURY_MIN_HEIST)throw new Error('MINIMUM_500_TREASURY');
  state.enabled=!state.enabled;state.changedAt=now;
  entry(state,state.enabled?'heists_enabled':'heists_disabled',0,actorId,'',now);
  tx.put(tk,state);
  return {enabled:state.enabled,changedAt:state.changedAt};
 });
}
export async function purchaseTreasuryItem(client,{guildId,actorId,kind,itemId,requestId}){
 validId(guildId);validId(actorId);validId(requestId);
 const tk=treasuryStorageKey(guildId),ik=transactionKey(requestId);
 return atomicSandTransaction(client,[tk,ik],async tx=>{
  if(tx.get(ik))return {...tx.get(ik),duplicate:true};
  const state=parse(tx.get(tk));
  if(activeRaid(state))throw new Error('TREASURY_LOCKED_DURING_HEIST');
  let price,description;
  if(kind==='defence'){
   const next=TREASURY_DEFENCES.find(x=>x.level===state.defence+1);
   if(!next)throw new Error('MAXIMUM_DEFENCE');
   price=next.price;description=next.name;state.defence=next.level;
  }else if(kind==='potion'){
   const item=TREASURY_POTIONS[itemId];
   if(!item)throw new Error('INVALID_POTION');
   price=item.price;description=item.name;
   if(state.potions[itemId]>=20)throw new Error('POTION_INVENTORY_FULL');
   state.potions[itemId]++;
  }else throw new Error('INVALID_ITEM');
  // These are the only treasury expenditures; reserve remains exposed to raids.
  if(state.balance<price||state.enabled&&state.balance-price<TREASURY_MIN_HEIST)
   throw new Error('INSUFFICIENT_TREASURY_FUNDS');
  state.balance-=price;state.spent+=price;
  entry(state,'purchase',-price,actorId,description);
  const result={balance:state.balance,price,description};
  tx.put(tk,state);tx.put(ik,result);return result;
 });
}
export async function activateTreasuryPotion(client,{guildId,actorId,itemId,now=Date.now()}){
 validId(guildId);validId(actorId);
 if(!TREASURY_POTIONS[itemId])throw new Error('INVALID_POTION');
 return atomicSandTransaction(client,[treasuryStorageKey(guildId)],async tx=>{
  const state=parse(tx.get(treasuryStorageKey(guildId)));
  if(state.potions[itemId]<1)throw new Error('NO_POTION');
  if(state.active[itemId]>now)throw new Error('POTION_ALREADY_ACTIVE');
  state.potions[itemId]--;
  state.active[itemId]=now+TREASURY_POTIONS[itemId].durationMs;
  entry(state,'potion_activated',0,actorId,itemId,now);
  tx.put(treasuryStorageKey(guildId),state);
  return {activeUntil:state.active[itemId],itemId};
 });
}
export function wallAt(raid,now=Date.now()){
 const since=now-raid.startedAt;
 if(since<0||since>=TREASURY_RAID_WINDOW_MS)return -1;
 return (raid.seed+Math.floor(since/1000))%3;
}
export async function createTreasuryHeist(client,{guildId,actorId,raidId,now=Date.now()}){
 validId(guildId);validId(actorId);validId(raidId);
 const attacking=await getTreasury(client,guildId);
 if(!attacking.enabled||attacking.balance<TREASURY_MIN_HEIST)throw new Error('HEIST_NOT_ELIGIBLE');
 if(attacking.raidCooldownUntil>now)throw new Error('HEIST_COOLDOWN');
 if(attacking.balance>=attacking.capacity)throw new Error('TREASURY_CAPACITY_REACHED');
 const guilds=[...(client.guilds?.cache?.values()||[])];
 const attackerOwner=client.guilds.cache.get(guildId)?.ownerId;
 const options=[];
 for(const guild of guilds){
  if(guild.id===guildId||!guild.id||(attackerOwner&&guild.ownerId===attackerOwner))continue;
  const state=await getTreasury(client,guild.id);
  if(state.enabled&&state.balance>=TREASURY_MIN_HEIST&&state.shieldUntil<=now&&
     (!state.pending||state.pending.endsAt<=now))options.push(guild);
 }
 if(!options.length)throw new Error('NO_ELIGIBLE_TARGETS');
 // Shuffle targets, then revalidate under both treasury locks.
 for(let i=options.length-1;i>0;i--){const j=randomInt(i+1);[options[i],options[j]]=[options[j],options[i]];}
 for(const target of options){
  const tk=treasuryStorageKey(guildId),dk=treasuryStorageKey(target.id);
  const result=await atomicSandTransaction(client,[tk,dk],async tx=>{
   const atk=parse(tx.get(tk)),def=parse(tx.get(dk));
   if(!atk.enabled||atk.balance<TREASURY_MIN_HEIST||atk.raidCooldownUntil>now||
      atk.balance>=treasuryCapacity((await client.db.get('guild:'+guildId+':progression',null))?.level||1)||
      activeRaid(atk,now))
    throw new Error('HEIST_COOLDOWN_OR_INELIGIBLE');
   if(!def.enabled||def.balance<TREASURY_MIN_HEIST||def.shieldUntil>now||
     def.pending&&def.pending.endsAt>now)return null;
   const raid={id:raidId,targetId:target.id,actorId,startedAt:now,
    endsAt:now+TREASURY_RAID_WINDOW_MS,seed:randomInt(3),status:'active',
    defence:def.defence};
   atk.raid=raid;atk.raidCooldownUntil=now+TREASURY_RAID_COOLDOWN_MS;
   def.pending={raidId,attackerId:guildId,endsAt:raid.endsAt};
   entry(atk,'raid_started',0,actorId,target.id,now);
   tx.put(tk,atk);tx.put(dk,def);
   return {raid,targetName:target.name,defence:def.defence,chance:TREASURY_DEFENCES[def.defence-1].chance};
  });
  if(result)return result;
 }
 throw new Error('NO_ELIGIBLE_TARGETS');
}
export async function resolveTreasuryHeist(client,{guildId,raidId,actorId,column=null,now=Date.now()}){
 validId(guildId);validId(raidId);if(actorId!==null)validId(actorId);
 const current=parse(await client.db.get(treasuryStorageKey(guildId),null));
 if(current.raid?.id!==raidId)throw new Error('HEIST_NOT_FOUND');
 const dk=treasuryStorageKey(current.raid.targetId),tk=treasuryStorageKey(guildId);
 const attackerCap=(await getTreasury(client,guildId)).capacity;
 const defenderCap=(await getTreasury(client,current.raid.targetId)).capacity;
 return atomicSandTransaction(client,[tk,dk],async tx=>{
  const atk=parse(tx.get(tk)),def=parse(tx.get(dk)),raid=atk.raid;
  if(!raid||raid.id!==raidId)throw new Error('HEIST_NOT_FOUND');
  if(raid.status==='completed')return {...raid.result,duplicate:true};
  if(actorId!==null&&raid.actorId!==actorId)throw new Error('HEIST_NOT_YOURS');
  // Defence is snapshotted at launch so changing it mid-raid cannot alter odds.
  // Older in-flight raids created before this change retain their original behaviour.
  const level=TREASURY_DEFENCES[(raid.defence??def.defence)-1];
  if(!level)throw new Error('INVALID_RAID_DEFENCE');
  const hit=actorId!==null&&Number.isInteger(column)&&column===wallAt(raid,now);
  const loot=Math.min(500,Math.floor(def.balance*level.loot/100),Math.max(0,attackerCap-atk.balance));
  // Full attacking vaults cannot record a misleading zero-coin win.
  const success=hit&&loot>0&&randomInt(100)<level.chance;
  let amount=0,received=0,forfeited=0;
  if(success){
   amount=loot;
   def.balance-=amount;atk.balance+=amount;atk.won+=amount;def.lost+=amount;
   received=amount;
   def.shieldUntil=now+TREASURY_SHIELD_MS;
  }else{
   amount=Math.min(atk.balance,Math.ceil(atk.balance*0.03));
   atk.balance-=amount;
   received=Math.min(amount,Math.max(0,defenderCap-def.balance));
   forfeited=amount-received; // Excess penalty is forfeited, never credited past capacity.
   def.balance+=received;
   atk.lost+=amount;def.won+=received;
   def.shieldUntil=now+TREASURY_FAILED_SHIELD_MS;
  }
  if(def.pending?.raidId===raidId)def.pending=null;
  raid.status='completed';
  raid.result={success,caught:!success,hit,amount,received,forfeited,
   chance:level.chance,targetId:raid.targetId,targetName:client.guilds.cache.get(raid.targetId)?.name||'Target Server',
   shieldUntil:def.shieldUntil};
  entry(atk,success?'raid_success':'raid_caught',success?amount:-amount,raid.actorId,raid.targetId,now);
  entry(def,success?'raid_defended_loss':'raid_defended_win',success?-amount:received,raid.actorId,guildId,now);
  tx.put(tk,atk);tx.put(dk,def);
  return raid.result;
 });
}

/** Recover unfinished timed raids after restarts so penalties cannot be dodged. */
export async function settleExpiredTreasuryHeists(client,now=Date.now()){
 let recovered=0;
 for(const guild of client.guilds?.cache?.values()||[]){
  try{
   const state=await getTreasury(client,guild.id);
   if(state.raid?.status==='active'&&state.raid.endsAt<=now){
    const result=await resolveTreasuryHeist(client,{
     guildId:guild.id,raidId:state.raid.id,actorId:null,now});
    if(!result.duplicate)recovered++;
   }
  }catch(error){
   const {logger}=await import('../utils/logger.js');
   logger.warn('Treasury timeout reconciliation failed',{guildId:guild.id,error:error.message});
  }
 }
 return recovered;
}
