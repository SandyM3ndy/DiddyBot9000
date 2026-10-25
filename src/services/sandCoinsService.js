/**
 * Sand Coins: quest participation and daily login rewards, account-wide.
 * Never reuses Beacon's retired guild-scoped economy balances.
 * Production mutations MUST run in a single PostgreSQL transaction.
 */
import { pgConfig } from '../config/database/postgres.js';
import { createHash } from 'node:crypto';
import { resolveLogChannel } from './loggingService.js';
import { getGuildConfig } from './config/guildConfig.js';
import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const PREFIX='beacon:sandcoins:v1:';
export const SAND_DAILY_LIMIT=200;
export const SAND_WEEKLY_LIMIT=600;
// Daily streak rewards are separate from quest-only earning caps.
export const SAND_DAILY_STREAK_REWARDS=Object.freeze([35,45,55,65,75,85,100]);
export const SAND_CATALOG=Object.freeze([
  {id:'sunset',name:'Sunset Glow',type:'background',price:300,description:'Warm sunset colour palette for the rank card.',palette:'sunset'},
  {id:'galaxy',name:'Galaxy Night',type:'background',price:1200,description:'A deep cosmic gradient for your community.',palette:'galaxy'},
  {id:'emerald',name:'Emerald Horizon',type:'background',price:500,description:'Rich green background accents.',palette:'emerald'},
  {id:'gold',name:'Golden Frame',type:'border',price:650,description:'Golden border around the rank card.',palette:'gold'},
  {id:'diamond',name:'Diamond Frame',type:'border',price:1600,description:'Icy diamond-inspired highlights.',palette:'diamond'},
  {id:'royal',name:'Royal Sands',type:'tag',price:950,description:'Limited-edition ROYAL SANDS rank-card title.',palette:'royal',limited:true,limit:5},
  {id:'pioneer',name:'Sand Pioneer',type:'tag',price:400,description:'PIONEER rank-card title.',palette:'pioneer'},
]);
export const SAND_SLOTS=Object.freeze(['background','border','tag']);
const walletKey=userId=>PREFIX+'wallet:'+userId;
const serverKey=guildId=>PREFIX+'server:'+guildId;
const vaultKey=guildId=>PREFIX+'inventory-vault:'+guildId;
export const SAND_INVENTORY_SNAPSHOT_DEPTH=8;
const claimKey=(eventId,userId)=>PREFIX+'claim:'+eventId+':'+userId;
const stockKey=itemId=>PREFIX+'stock:'+itemId;
const validId=value=>typeof value==='string' && /^\d{17,20}$/.test(value);
const initialWallet=()=>({balance:0,lifetime:0,earnedToday:0,earnedWeek:0,day:'',week:'',history:[],leaderboardHidden:false,dailyStreak:0,lastDailyClaimDate:''});
const initialServer=()=>({inventory:[],equipped:{background:null,border:null,tag:null},purchases:[],pendingLogs:[],tradeOffers:[],pendingTradeLogs:[],tradeHistory:[]});
const safeNumber=value=>Number.isSafeInteger(value)&&value>=0;
function requireId(value,label){if(!validId(value))throw new Error('Invalid '+label);}
function readWallet(value){
 const d={...initialWallet(),...(value&&typeof value==='object'?value:{})};
 if(!safeNumber(d.balance)||!safeNumber(d.lifetime))throw new Error('Invalid Sand Coins wallet');
 d.history=Array.isArray(d.history)?d.history:[];
 return d;
}
function readServer(value){
 if(value!==null&&value!==undefined&&(typeof value!=='object'||Array.isArray(value)))
  throw new Error('Sand Coins server inventory is malformed; refusing to erase it');
 const d={...initialServer(),...(value||{})};
 // NEVER filter by the live shop catalog. Retired, limited, or temporarily
 // unavailable items must survive reads, edits, log replay, and upgrades.
 if(!Array.isArray(d.inventory)||d.inventory.some(id=>typeof id!=='string'||!id||id.length>128))
  throw new Error('Sand Coins server inventory is malformed; refusing to overwrite it');
 if(new Set(d.inventory).size!==d.inventory.length)
  throw new Error('Sand Coins server inventory contains duplicate IDs; manual review required');
 d.inventory=[...d.inventory];
 d.equipped={...initialServer().equipped,...(d.equipped||{})};
 d.purchases=Array.isArray(d.purchases)?d.purchases:[];
 d.pendingLogs=Array.isArray(d.pendingLogs)?d.pendingLogs:[];
 d.tradeOffers=Array.isArray(d.tradeOffers)?d.tradeOffers:[];
 d.pendingTradeLogs=Array.isArray(d.pendingTradeLogs)?d.pendingTradeLogs:[];
 d.tradeHistory=Array.isArray(d.tradeHistory)?d.tradeHistory:[];
 return d;
}
function dayKey(now){return now.toISOString().slice(0,10);}
function weekKey(now){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return dayKey(d);}
function withWindow(wallet,now){
 const d=dayKey(now),w=weekKey(now);
 if(wallet.day!==d){wallet.day=d;wallet.earnedToday=0;}
 if(wallet.week!==w){wallet.week=w;wallet.earnedWeek=0;}
 return wallet;
}
// The UTC calendar-day streak survives reboots, purchases and switching servers.
function dailyClaimState(wallet,now){
 const today=dayKey(now),last=wallet.lastDailyClaimDate||'';
 const lastMs=/^\d{4}-\d{2}-\d{2}$/.test(last)?Date.parse(last+'T00:00:00.000Z'):NaN;
 const currentMs=Date.parse(today+'T00:00:00.000Z');
 const days=Number.isFinite(lastMs)?(currentMs-lastMs)/86400000:Infinity;
 const prev=Number.isSafeInteger(wallet.dailyStreak)?Math.max(0,Math.min(7,wallet.dailyStreak)):0;
 const alreadyClaimed=days===0;
 const streak=days===0||days===1?prev:0;
 const nextStreak=alreadyClaimed||days===1?Math.min(7,streak+1):1;
 return {alreadyClaimed,streak,nextStreak,nextReward:SAND_DAILY_STREAK_REWARDS[nextStreak-1],
  nextClaimAt:Math.floor((currentMs+86400000)/1000),today};
}
export function getSandDailyStatusFromWallet(wallet,now=new Date()){
 if(!(now instanceof Date)||Number.isNaN(now.getTime()))throw new Error('Invalid claim time');
 return dailyClaimState(readWallet(wallet),now);
}

/**
 * One bonus per UTC day across ALL Beacon servers. The PostgreSQL wallet
 * transaction prevents repeated or simultaneous claims from paying twice.
 */
export async function claimSandDaily(client,{userId,now=new Date()}){
 requireId(userId,'user ID');
 if(!(now instanceof Date)||Number.isNaN(now.getTime()))throw new Error('Invalid claim time');
 const wk=walletKey(userId);
 return atomic(client,[wk],async tx=>{
  const wallet=withWindow(readWallet(tx.get(wk)),now);
  const state=dailyClaimState(wallet,now);
  if(state.alreadyClaimed)return {claimed:false,amount:0,balance:wallet.balance,...state};
  const streak=state.nextStreak,amount=SAND_DAILY_STREAK_REWARDS[streak-1];
  if(!safeNumber(wallet.balance+amount)||!safeNumber(wallet.lifetime+amount))
   throw new Error('Sand Coins wallet overflow');
  wallet.balance+=amount;wallet.lifetime+=amount;
  wallet.dailyStreak=streak;wallet.lastDailyClaimDate=state.today;
  recordHistory(wallet,{kind:'daily',delta:amount,streak,at:now.toISOString()});
  tx.put(wk,wallet);
  return {claimed:true,amount,balance:wallet.balance,streak,
   nextClaimAt:state.nextClaimAt,alreadyClaimed:false};
 });
}
function recordHistory(wallet,item){
 wallet.history=[item,...wallet.history].slice(0,30);
}
function getPool(client){return client?.db?.db?.pool && client.db.db.isAvailable?.()?client.db.db.pool:null;}
/** Transactionally mutate multiple temp_data keys, including idempotency claims. */
async function atomic(client,keys,fn){
 const pool=getPool(client);
 if(!pool)throw new Error('Sand Coins require a persistent PostgreSQL connection');
 const c=await pool.connect();
 const table=pgConfig.tables.temp_data;
 const unique=[...new Set(keys)].sort();
 try{
  await c.query('BEGIN');
  // Serialized even if the keys have not been created yet. Fixed order avoids deadlocks.
  for(const key of unique)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  const state=new Map();
  for(const key of unique){
   const r=await c.query(`SELECT value FROM ${table} WHERE key = $1 FOR UPDATE`,[key]);
   state.set(key,r.rows[0]?.value??null);
  }
  const dirty=new Map();
  const ctx={get:key=>dirty.has(key)?dirty.get(key):state.get(key),put:(key,value)=>{
   if(!state.has(key))throw new Error('Unlocked Sand Coins key');
   dirty.set(key,value);
  }};
  const result=await fn(ctx);
  for(const [key,value] of dirty)await c.query(
   `INSERT INTO ${table} (key,value,expires_at) VALUES ($1,$2::jsonb,NULL)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,expires_at=NULL`,
   [key,JSON.stringify(value)]);
  await c.query('COMMIT');
  return result;
 }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err;}
 finally{c.release();}
}
export async function getSandWallet(client,userId){
 requireId(userId,'user ID');
 return withWindow(readWallet(await client.db.get(walletKey(userId),null)),new Date());
}
export async function setSandLeaderboardHidden(client,userId,hidden){
 requireId(userId,'user ID');
 const key=walletKey(userId);
 return atomic(client,[key],async tx=>{
  const w=readWallet(tx.get(key));
  w.leaderboardHidden=hidden===true;
  tx.put(key,w);
  return w.leaderboardHidden;
 });
}
export async function getSandGlobalLeaderboard(client,limit=10){
 const keys=(await client.db.list(PREFIX+'wallet:')).filter(key=>
  key.startsWith(PREFIX+'wallet:') && /^\d{17,20}$/.test(key.slice((PREFIX+'wallet:').length)));
 const rows=[];
 for(let i=0;i<keys.length;i+=8){
  const part=keys.slice(i,i+8);
  rows.push(...(await Promise.all(part.map(async key=>{
   const wallet=readWallet(await client.db.get(key,null));
   if(wallet.leaderboardHidden||wallet.lifetime<=0)return null;
   return {userId:key.slice((PREFIX+'wallet:').length),earned:wallet.lifetime};
  }))).filter(Boolean));
 }
 return rows.sort((a,b)=>b.earned-a.earned||a.userId.localeCompare(b.userId)).slice(0,limit);
}
/**
 * Independent PostgreSQL inventory vault. Every inventory mutation updates
 * the live record AND a checksummed rolling set of recovery snapshots in the
 * SAME transaction, with identical advisory locks and no expiry.
 *
 * Never reconstruct from purchase receipts: traded-away items must remain gone.
 * Never silently replace a primary record with a different valid snapshot:
 * mismatches are flagged for investigation to prevent item duplication.
 */
function stableJson(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableJson(value[key])).join(',')+'}';
}
function inventoryHash(server){return createHash('sha256').update(stableJson(server)).digest('hex');}
function readInventoryVault(raw,guildId){
 if(raw===null||raw===undefined)return null;
 if(!raw||typeof raw!=='object'||raw.schema!==1||raw.guildId!==guildId||
    !Number.isSafeInteger(raw.revision)||raw.revision<1||
    !Array.isArray(raw.snapshots)||raw.snapshots.length<1||
    raw.snapshots.length>SAND_INVENTORY_SNAPSHOT_DEPTH)
  throw new Error('Sand Coins inventory vault metadata invalid; refusing unsafe restoration');
 const current=raw.snapshots[0];
 if(current.revision!==raw.revision||current.checksum!==raw.checksum||
    !Number.isFinite(Date.parse(current.at))||!Array.isArray(current.server?.inventory))
  throw new Error('Sand Coins inventory vault snapshot invalid');
 for(const entry of raw.snapshots){
  if(!Number.isSafeInteger(entry.revision)||entry.revision<1||
      !Number.isFinite(Date.parse(entry.at))||
      (readServer(entry.server),inventoryHash(entry.server))!==entry.checksum)
   throw new Error('Sand Coins inventory vault checksum failure; refusing unsafe restoration');
 }
 return raw;
}
function verifiedServer(tx,guildId){
 const current=tx.get(serverKey(guildId));
 const vault=readInventoryVault(tx.get(vaultKey(guildId)),guildId);
 if(current===null||current===undefined){
  // Safe only because both keys are locked: no concurrent purchase/trade can
  // slip between the recovery read and the primary restoration.
  if(vault){
   const restored=readServer(vault.snapshots[0].server);
   tx.put(serverKey(guildId),restored);
   tx.put(vaultKey(guildId),{...vault,recoveryCount:(vault.recoveryCount||0)+1,
    lastRecoveredAt:new Date().toISOString()});
   logger.warn('Recovered missing Sand Coins inventory from verified PostgreSQL vault',
    {guildId,revision:vault.revision});
   return restored;
  }
  return initialServer();
 }
 const server=readServer(current);
 if(vault&&inventoryHash(current)!==vault.checksum)
  throw new Error('Sand Coins inventory/vault disagreement: writes blocked pending manual review');
 return server;
}
function storeServer(tx,guildId,server,reason,operationId=null){
 const current=readServer(server);
 const previous=readInventoryVault(tx.get(vaultKey(guildId)),guildId);
 // Keep eight distinct inventory/appearance revisions. Audit delivery and
 // pending trade offers are still mirrored durably, but must not evict actual
 // purchase/trade/equipment recovery points from the rolling history.
 const changedInventory=!previous||
  ['purchase','equip','unequip','trade_completed','legacy_inventory_protected'].includes(reason);
 const revision=(previous?.revision||0)+(changedInventory?1:0);
 const entry={revision,at:new Date().toISOString(),reason,
  operationId,checksum:inventoryHash(current),server:structuredClone(current)};
 const savedHistory=changedInventory?previous?.snapshots||[]:previous?.snapshots.slice(1)||[];
 const vault={schema:1,guildId,revision,checksum:entry.checksum,
  recoveryCount:previous?.recoveryCount||0,lastRecoveredAt:previous?.lastRecoveredAt||null,
  snapshots:[entry,...savedHistory].slice(0,SAND_INVENTORY_SNAPSHOT_DEPTH)};
 tx.put(serverKey(guildId),current);
 tx.put(vaultKey(guildId),vault);
 return {revision,at:entry.at};
}
/**
 * A verified, consistent point-in-time read for owners and backups.
 * Server data and the vault revision are fetched under the SAME locks,
 * preventing export files from mixing pre-trade and post-trade states.
 */
export async function getSandInventoryProtectedSnapshot(client,guildId){
 requireId(guildId,'server ID');
 const sk=serverKey(guildId),vk=vaultKey(guildId);
 return atomic(client,[sk,vk],async tx=>{
  const server=verifiedServer(tx,guildId);
  // Backfill legacy inventories (including archived catalog items) safely.
  if(!tx.get(vk)){
   storeServer(tx,guildId,server,'legacy_inventory_protected');
   logger.info('Created durable Sand Coins inventory recovery vault',
    {guildId,items:server.inventory.length});
  }
  const vault=readInventoryVault(tx.get(vk),guildId);
  return {server,backup:{protected:true,revision:vault.revision,copies:vault.snapshots.length,
   savedAt:vault.snapshots[0].at,items:server.inventory.length,
   recoveryCount:vault.recoveryCount||0,lastRecoveredAt:vault.lastRecoveredAt||null}};
 });
}
export async function getSandServer(client,guildId){
 return (await getSandInventoryProtectedSnapshot(client,guildId)).server;
}
export async function getSandInventoryBackupStatus(client,guildId){
 return (await getSandInventoryProtectedSnapshot(client,guildId)).backup;
}
export function getSandCatalogItem(id){return SAND_CATALOG.find(item=>item.id===id)||null;}
export async function getSandLimitedStock(client,itemId){
 const item=getSandCatalogItem(itemId);
 if(!item?.limit)return null;
 const purchased=await client.db.get(stockKey(itemId),0);
 return {total:item.limit,remaining:Math.max(0,item.limit-(Number(purchased)||0))};
}
export function getSandAppearance(server){
 const s=readServer(server);
 return Object.fromEntries(SAND_SLOTS.map(slot=>[slot,
  s.inventory.includes(s.equipped[slot]) && getSandCatalogItem(s.equipped[slot])?.type===slot
   ?s.equipped[slot]:null]));
}
/**
 * Globally idempotent claim. Return credited=0 if already claimed or a global cap is reached.
 * eventId format: guildId:daily/weekly:UTC-period:quest-id.
 */
export async function grantQuestSandCoins(client,{userId,guildId,eventId,amount,weekly=false}){
 requireId(userId,'user ID');requireId(guildId,'server ID');
 if(!/^\d{17,20}:(daily|weekly):\d{4}-\d{2}-\d{2}:[a-z0-9_]{1,64}$/.test(eventId))
  throw new Error('Invalid Sand Coins quest event');
 if(!safeNumber(amount)||amount===0||amount>200)throw new Error('Invalid Sand Coins reward');
 const wk=walletKey(userId),ck=claimKey(eventId,userId);
 return atomic(client,[wk,ck],async tx=>{
  if(tx.get(ck))return {credited:0,duplicate:true};
  const now=new Date(),wallet=withWindow(readWallet(tx.get(wk)),now);
  const allowance=Math.min(amount,Math.max(0,SAND_DAILY_LIMIT-wallet.earnedToday),
    Math.max(0,SAND_WEEKLY_LIMIT-wallet.earnedWeek));
  if(allowance && (!safeNumber(wallet.balance+allowance)||!safeNumber(wallet.lifetime+allowance)))
   throw new Error('Wallet overflow');
  wallet.balance+=allowance;wallet.lifetime+=allowance;
  wallet.earnedToday+=allowance;wallet.earnedWeek+=allowance;
  recordHistory(wallet,{kind:'quest',delta:allowance,guildId,eventId,at:now.toISOString()});
  tx.put(wk,wallet);
  tx.put(ck,{amount:allowance,at:now.toISOString()}); // persistent, no replay payout
  return {credited:allowance,duplicate:false,balance:wallet.balance};
 });
}
export async function buySandDecoration(client,{userId,guildId,itemId,purchaseId}){
 requireId(userId,'user ID');requireId(guildId,'server ID');
 if(!/^\d{17,20}$/.test(String(purchaseId)))throw new Error('Invalid purchase request');
 const item=getSandCatalogItem(itemId);
 if(!item)throw new Error('Unknown shop item');
 const wk=walletKey(userId),sk=serverKey(guildId),pk=PREFIX+'purchase:'+purchaseId;
 const stock=item.limit?stockKey(itemId):null;
 return atomic(client,[wk,sk,vaultKey(guildId),pk,...(stock?[stock]:[])],async tx=>{
  if(tx.get(pk)){
   const prior=tx.get(pk);
   if(prior.purchase?.userId!==userId||prior.purchase?.guildId!==guildId||
       prior.purchase?.itemId!==itemId)
    return {error:'PURCHASE_ID_REUSED'};
   return {duplicate:true,...prior};
  }
  const wallet=withWindow(readWallet(tx.get(wk)),new Date()),server=verifiedServer(tx,guildId);
  if(server.inventory.includes(itemId))return {error:'ALREADY_OWNED'};
  if(stock && Number(tx.get(stock)||0)>=item.limit)return {error:'SOLD_OUT'};
  if(wallet.balance<item.price)return {error:'INSUFFICIENT_FUNDS',balance:wallet.balance,price:item.price};
  const now=new Date().toISOString(),balance=wallet.balance-item.price;
  wallet.balance=balance;
  recordHistory(wallet,{kind:'purchase',delta:-item.price,guildId,itemId,at:now});
  const purchase={id:String(purchaseId),userId,guildId,itemId,price:item.price,at:now};
  server.inventory.push(itemId);
  server.purchases=[purchase,...server.purchases].slice(0,50);
  server.pendingLogs.push(purchase); // durable audit outbox
  tx.put(wk,wallet);storeServer(tx,guildId,server,'purchase',String(purchaseId));tx.put(pk,{purchase,balance});
  if(stock)tx.put(stock,Number(tx.get(stock)||0)+1);
  return {purchase,balance,duplicate:false};
 });
}
export async function equipSandDecoration(client,{guildId,itemId,slot,actorId}){
 requireId(guildId,'server ID');requireId(actorId,'user ID');
 if(!SAND_SLOTS.includes(slot))throw new Error('Invalid appearance slot');
 if(itemId!==null && getSandCatalogItem(itemId)?.type!==slot)throw new Error('Invalid cosmetic for selected slot');
 const sk=serverKey(guildId);
 return atomic(client,[sk,vaultKey(guildId)],async tx=>{
  const server=verifiedServer(tx,guildId);
  if(itemId!==null&&!server.inventory.includes(itemId))return {error:'NOT_OWNED'};
  server.equipped[slot]=itemId;
  storeServer(tx,guildId,server,itemId===null?'unequip':'equip',actorId);
  return {appearance:getSandAppearance(server)};
 });
}

/** Global account-to-account payments: atomic, one-time, non-minting. */
export async function transferSandCoins(client,{fromId,toId,amount,transferId}){
 requireId(fromId,'sender ID');requireId(toId,'recipient ID');requireId(String(transferId),'transfer ID');
 if(fromId===toId)throw new Error('Cannot pay yourself');
 if(!Number.isSafeInteger(amount)||amount<1||amount>10000)throw new Error('Transfers must be 1–10,000 Sand Coins');
 const fk=walletKey(fromId),tk=walletKey(toId),id=PREFIX+'transfer:'+transferId;
 return atomic(client,[fk,tk,id],async tx=>{
  const prior=tx.get(id);
  if(prior)return prior.fromId===fromId&&prior.toId===toId&&prior.amount===amount
   ?{...prior,duplicate:true}:{error:'TRANSFER_ID_REUSED'};
  const from=withWindow(readWallet(tx.get(fk)),new Date());
  const to=withWindow(readWallet(tx.get(tk)),new Date());
  if(from.balance<amount)return {error:'INSUFFICIENT_FUNDS',balance:from.balance};
  if(!safeNumber(to.balance+amount))throw new Error('Recipient wallet overflow');
  from.balance-=amount;to.balance+=amount;
  const at=new Date().toISOString();
  recordHistory(from,{kind:'payment_sent',delta:-amount,toId,transferId,at});
  recordHistory(to,{kind:'payment_received',delta:amount,fromId,transferId,at});
  tx.put(fk,from);tx.put(tk,to);
  const result={fromId,toId,amount,fromBalance:from.balance,toBalance:to.balance};
  tx.put(id,result);
  return {...result,duplicate:false};
 });
}
const TRADE_TTL_MS=24*60*60*1000;
const tradeKey=id=>PREFIX+'trade:'+id;
const activeOffers=(server,now)=>server.tradeOffers.filter(offer=>
 offer&&typeof offer.id==='string'&&Number.isFinite(offer.expiresAt)&&offer.expiresAt>now);
function assertTradeId(id){requireId(String(id),'trade ID');}
function assertItem(id){if(!getSandCatalogItem(id))throw new Error('Unknown Sand Coins decoration');}
function tradeNotification(offer,status,actorId){
 return {id:offer.id+':'+status,tradeId:offer.id,status,fromGuildId:offer.fromGuildId,
  toGuildId:offer.toGuildId,offeredItem:offer.offeredItem,requestedItem:offer.requestedItem,
  actorId,at:new Date().toISOString()};
}
function addTradeNotification(server,offer,status,actorId){
 server.pendingTradeLogs.push(tradeNotification(offer,status,actorId));
}
export async function getSandTrade(client,id){
 assertTradeId(id);
 return await client.db.get(tradeKey(id),null);
}
/** An owner offers one server-owned cosmetic for another, requiring the other owner's approval. */
export async function offerSandTrade(client,{tradeId,fromGuildId,toGuildId,fromOwnerId,toOwnerId,offeredItem,requestedItem,now=new Date()}){
 assertTradeId(tradeId);requireId(fromGuildId,'source server ID');requireId(toGuildId,'destination server ID');
 requireId(fromOwnerId,'source owner ID');requireId(toOwnerId,'destination owner ID');
 assertItem(offeredItem);assertItem(requestedItem);
 if(fromGuildId===toGuildId)throw new Error('Trade must involve different servers');
 if(!Number.isFinite(now.getTime()))throw new Error('Invalid trade time');
 const a=serverKey(fromGuildId),b=serverKey(toGuildId),k=tradeKey(tradeId);
 return atomic(client,[a,b,vaultKey(fromGuildId),vaultKey(toGuildId),k],async tx=>{
  if(tx.get(k))return {error:'DUPLICATE_TRADE'};
  const from=verifiedServer(tx,fromGuildId),to=verifiedServer(tx,toGuildId);
  if(!from.inventory.includes(offeredItem))return {error:'OFFER_NOT_OWNED'};
  if(!to.inventory.includes(requestedItem))return {error:'REQUEST_NOT_OWNED'};
  if(to.inventory.includes(offeredItem)||from.inventory.includes(requestedItem))
   return {error:'DUPLICATE_INVENTORY'};
  from.tradeOffers=activeOffers(from,now.getTime());
  to.tradeOffers=activeOffers(to,now.getTime());
  if(from.tradeOffers.length>=5||to.tradeOffers.length>=10)return {error:'TOO_MANY_OFFERS'};
  const offer={id:tradeId,fromGuildId,toGuildId,fromOwnerId,toOwnerId,offeredItem,requestedItem,
   status:'pending',createdAt:now.toISOString(),expiresAt:now.getTime()+TRADE_TTL_MS};
  for(const state of [from,to]){
   state.tradeOffers.push({id:tradeId,expiresAt:offer.expiresAt});
   addTradeNotification(state,offer,'offered',fromOwnerId);
  }
  storeServer(tx,fromGuildId,from,'trade_offered',tradeId);
  storeServer(tx,toGuildId,to,'trade_offered',tradeId);
  tx.put(k,offer);
  return {offer};
 });
}
export async function getSandServerTradeOffers(client,guildId){
 const server=await getSandServer(client,guildId);
 const ids=[...new Set(server.tradeOffers.map(e=>e.id))].slice(-25);
 const offers=await Promise.all(ids.map(id=>getSandTrade(client,id)));
 return offers.filter(o=>o&&o.status==='pending'&&o.expiresAt>Date.now());
}
/**
 * Accept/decline/cancel by the CURRENT owner of the acting guild. Caller supplies
 * current owner IDs verified from Discord; stale offers after ownership changes fail.
 */
export async function resolveSandTrade(client,{tradeId,actorId,actingGuildId,fromOwnerId,toOwnerId,decision,now=new Date()}){
 assertTradeId(tradeId);requireId(actorId,'actor ID');requireId(actingGuildId,'acting guild ID');
 requireId(fromOwnerId,'source owner ID');requireId(toOwnerId,'destination owner ID');
 if(!['accept','decline','cancel'].includes(decision))throw new Error('Invalid trade decision');
 const k=tradeKey(tradeId),initial=await client.db.get(k,null);
 if(!initial)return {error:'TRADE_NOT_FOUND'};
 const a=serverKey(initial.fromGuildId),b=serverKey(initial.toGuildId);
 return atomic(client,[a,b,vaultKey(initial.fromGuildId),vaultKey(initial.toGuildId),k],async tx=>{
  const offer=tx.get(k);
  // The pre-read determines the locked guild keys. A changed mapping is
  // untrusted and cannot transfer items under the wrong locks.
  if(offer&&(offer.fromGuildId!==initial.fromGuildId||offer.toGuildId!==initial.toGuildId))
   throw new Error('Trade guild mapping changed: refusing unsafe transfer');
  if(!offer||offer.status!=='pending')return {error:'TRADE_NOT_PENDING'};
  if(offer.fromOwnerId!==fromOwnerId||offer.toOwnerId!==toOwnerId)
   return {error:'OWNERSHIP_CHANGED'};
  if(decision==='cancel'){
   if(actorId!==fromOwnerId||actingGuildId!==offer.fromGuildId)return {error:'OWNER_ONLY'};
  }else{
   if(actorId!==toOwnerId||actingGuildId!==offer.toGuildId)return {error:'OWNER_ONLY'};
  }
  const from=verifiedServer(tx,offer.fromGuildId),to=verifiedServer(tx,offer.toGuildId);
  const expired=offer.expiresAt<=now.getTime();
  if(decision==='accept'&&expired)return {error:'TRADE_EXPIRED'};
  if(decision==='accept'){
   if(!from.inventory.includes(offer.offeredItem)||!to.inventory.includes(offer.requestedItem))
    return {error:'INVENTORY_CHANGED'};
   if(to.inventory.includes(offer.offeredItem)||from.inventory.includes(offer.requestedItem))
    return {error:'DUPLICATE_INVENTORY'};
   from.inventory=from.inventory.filter(id=>id!==offer.offeredItem).concat(offer.requestedItem);
   to.inventory=to.inventory.filter(id=>id!==offer.requestedItem).concat(offer.offeredItem);
   const removeEquipped=(server,item)=>{
    for(const [slot,id] of Object.entries(server.equipped))if(id===item)server.equipped[slot]=null;
   };
   removeEquipped(from,offer.offeredItem);removeEquipped(to,offer.requestedItem);
  }
  const status=decision==='accept'?'completed':decision==='decline'?'declined':'cancelled';
  const ended={...offer,status,closedAt:now.toISOString(),resolvedBy:actorId};
  for(const state of [from,to]){
   state.tradeOffers=state.tradeOffers.filter(x=>x.id!==tradeId);
   state.tradeHistory=[{id:tradeId,status,offeredItem:offer.offeredItem,requestedItem:offer.requestedItem,
    otherGuildId:state===from?offer.toGuildId:offer.fromGuildId,at:ended.closedAt},...state.tradeHistory].slice(0,30);
   addTradeNotification(state,offer,status,actorId);
  }
  storeServer(tx,offer.fromGuildId,from,'trade_'+status,tradeId);
  storeServer(tx,offer.toGuildId,to,'trade_'+status,tradeId);
  tx.put(k,ended);
  return {offer:ended};
 });
}
/** Durable, per-server audit outbox for trade offers and their resolutions. */
export async function deliverSandTradeLogs(client,guildId){
 const config=await getGuildConfig(client,guildId);
 const logId=resolveLogChannel(config,'audit');
 if(!logId)return {error:'LOG_CHANNEL_NOT_CONFIGURED'};
 const guild=client.guilds.cache.get(guildId)||await client.guilds.fetch(guildId).catch(()=>null);
 const channel=guild?.channels.cache.get(logId)||await guild?.channels.fetch(logId).catch(()=>null);
 if(!channel?.send)return {error:'LOG_CHANNEL_MISSING'};
 const pending=(await getSandServer(client,guildId)).pendingTradeLogs.slice(0,25);
 let delivered=0;
 for(const entry of pending){
  try{
   await channel.send({embeds:[createEmbed({
    title:'🔄 Sand Coins • Inventory Trade '+entry.status.toUpperCase(),
    description:'Cross-server trade '+entry.status+'. Server-owned items change hands only after both owners agree.',
    fields:[
     {name:'Trade ID',value:entry.tradeId},
     {name:'From server',value:entry.fromGuildId,inline:true},
     {name:'To server',value:entry.toGuildId,inline:true},
     {name:'Offered item',value:getSandCatalogItem(entry.offeredItem)?.name||entry.offeredItem,inline:true},
     {name:'Requested item',value:getSandCatalogItem(entry.requestedItem)?.name||entry.requestedItem,inline:true},
     {name:'Action by',value:'<@'+entry.actorId+'>',inline:true},
    ],color:entry.status==='completed'?'success':'info',footer:'Beacon • Server inventory trade audit',
   })],allowedMentions:{parse:[]}});
   await atomic(client,[serverKey(guildId),vaultKey(guildId)],async tx=>{
    const server=verifiedServer(tx,guildId);
    server.pendingTradeLogs=server.pendingTradeLogs.filter(log=>log.id!==entry.id);
    storeServer(tx,guildId,server,'trade_audit_delivered',entry.id);
   });
   delivered++;
  }catch(err){logger.warn('Sand Coins trade audit delivery deferred',{guildId,error:err.message});break;}
 }
 return {delivered,pending:pending.length-delivered};
}

/** Outbox replay on shop use so temporarily offline log channels do not lose purchases. */
export async function deliverSandPurchaseLogs(client,guildId){
 const config=await getGuildConfig(client,guildId);
 const logId=resolveLogChannel(config,'audit');
 if(!logId)return {error:'LOG_CHANNEL_NOT_CONFIGURED'};
 const guild=client.guilds.cache.get(guildId)||await client.guilds.fetch(guildId).catch(()=>null);
 const channel=guild?.channels.cache.get(logId)||await guild?.channels.fetch(logId).catch(()=>null);
 if(!channel?.send)return {error:'LOG_CHANNEL_MISSING'};
 const pending=(await getSandServer(client,guildId)).pendingLogs.slice(0,25);
 let delivered=0;
 for(const entry of pending){
  try{
   const item=getSandCatalogItem(entry.itemId);
   await channel.send({
    embeds:[createEmbed({
     title:'🪙 Sand Coins • Shop Purchase',
     description:'A member purchased a new decoration for this server\'s rank-card inventory.',
     fields:[
      {name:'Purchaser',value:'<@'+entry.userId+'>',inline:true},
      {name:'Item',value:item?.name||entry.itemId,inline:true},
      {name:'Price',value:entry.price.toLocaleString()+' SC',inline:true},
      {name:'Equipping',value:'Server owner or members with **Manage Server** can equip it using /sandcoins equip.'},
     ],color:'success',
     footer:'Beacon • Sand Coins • Purchase '+entry.id,
    })],allowedMentions:{parse:[]},
   });
   await atomic(client,[serverKey(guildId),vaultKey(guildId)],async tx=>{
    const server=verifiedServer(tx,guildId);
    server.pendingLogs=server.pendingLogs.filter(e=>e.id!==entry.id);
    storeServer(tx,guildId,server,'purchase_audit_delivered',entry.id);
   });
   delivered++;
  }catch(err){logger.warn('Sand Coins purchase log delivery deferred',{guildId,error:err.message});break;}
 }
 return {delivered,pending:pending.length-delivered};
}
