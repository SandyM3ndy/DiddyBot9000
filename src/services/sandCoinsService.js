/**
 * Sand Coins: quest-only, account-wide virtual currency.
 * Never reuses Beacon's retired guild-scoped economy balances.
 * Production mutations MUST run in a single PostgreSQL transaction.
 */
import { pgConfig } from '../config/database/postgres.js';
import { resolveLogChannel } from './loggingService.js';
import { getGuildConfig } from './config/guildConfig.js';
import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const PREFIX='beacon:sandcoins:v1:';
export const SAND_DAILY_LIMIT=200;
export const SAND_WEEKLY_LIMIT=600;
export const SAND_CATALOG=Object.freeze([
  {id:'sunset',name:'Sunset Glow',type:'background',price:300,description:'Warm sunset colour palette for the rank card.',palette:'sunset'},
  {id:'galaxy',name:'Galaxy Night',type:'background',price:1200,description:'A deep cosmic gradient for your community.',palette:'galaxy'},
  {id:'emerald',name:'Emerald Horizon',type:'background',price:500,description:'Rich green background accents.',palette:'emerald'},
  {id:'gold',name:'Golden Frame',type:'border',price:650,description:'Golden border around the rank card.',palette:'gold'},
  {id:'diamond',name:'Diamond Frame',type:'border',price:1600,description:'Icy diamond-inspired highlights.',palette:'diamond'},
  {id:'royal',name:'Royal Sands',type:'tag',price:950,description:'Limited-edition ROYAL SANDS rank-card title.',palette:'royal',limited:true,limit:25},
  {id:'pioneer',name:'Sand Pioneer',type:'tag',price:400,description:'PIONEER rank-card title.',palette:'pioneer'},
]);
export const SAND_SLOTS=Object.freeze(['background','border','tag']);
const walletKey=userId=>PREFIX+'wallet:'+userId;
const serverKey=guildId=>PREFIX+'server:'+guildId;
const claimKey=(eventId,userId)=>PREFIX+'claim:'+eventId+':'+userId;
const stockKey=itemId=>PREFIX+'stock:'+itemId;
const validId=value=>typeof value==='string' && /^\d{17,20}$/.test(value);
const initialWallet=()=>({balance:0,lifetime:0,earnedToday:0,earnedWeek:0,day:'',week:'',history:[],leaderboardHidden:false});
const initialServer=()=>({inventory:[],equipped:{background:null,border:null,tag:null},purchases:[],pendingLogs:[]});
const safeNumber=value=>Number.isSafeInteger(value)&&value>=0;
function requireId(value,label){if(!validId(value))throw new Error('Invalid '+label);}
function readWallet(value){
 const d={...initialWallet(),...(value&&typeof value==='object'?value:{})};
 if(!safeNumber(d.balance)||!safeNumber(d.lifetime))throw new Error('Invalid Sand Coins wallet');
 d.history=Array.isArray(d.history)?d.history:[];
 return d;
}
function readServer(value){
 const d={...initialServer(),...(value&&typeof value==='object'?value:{})};
 d.inventory=Array.isArray(d.inventory)?d.inventory.filter(id=>SAND_CATALOG.some(x=>x.id===id)):[];
 d.equipped={...initialServer().equipped,...(d.equipped||{})};
 d.purchases=Array.isArray(d.purchases)?d.purchases:[];
 d.pendingLogs=Array.isArray(d.pendingLogs)?d.pendingLogs:[];
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
  const ctx={get:key=>state.get(key),put:(key,value)=>{
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
  key.startsWith(PREFIX+'wallet:') && /^\\d{17,20}$/.test(key.slice((PREFIX+'wallet:').length)));
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
export async function getSandServer(client,guildId){
 requireId(guildId,'server ID');
 return readServer(await client.db.get(serverKey(guildId),null));
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
 return atomic(client,[wk,sk,pk,...(stock?[stock]:[])],async tx=>{
  if(tx.get(pk))return {duplicate:true,...tx.get(pk)};
  const wallet=withWindow(readWallet(tx.get(wk)),new Date()),server=readServer(tx.get(sk));
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
  tx.put(wk,wallet);tx.put(sk,server);tx.put(pk,{purchase,balance});
  if(stock)tx.put(stock,Number(tx.get(stock)||0)+1);
  return {purchase,balance,duplicate:false};
 });
}
export async function equipSandDecoration(client,{guildId,itemId,slot,actorId}){
 requireId(guildId,'server ID');requireId(actorId,'user ID');
 if(!SAND_SLOTS.includes(slot))throw new Error('Invalid appearance slot');
 if(itemId!==null && getSandCatalogItem(itemId)?.type!==slot)throw new Error('Invalid cosmetic for selected slot');
 const sk=serverKey(guildId);
 return atomic(client,[sk],async tx=>{
  const server=readServer(tx.get(sk));
  if(itemId!==null&&!server.inventory.includes(itemId))return {error:'NOT_OWNED'};
  server.equipped[slot]=itemId;
  tx.put(sk,server);
  return {appearance:getSandAppearance(server)};
 });
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
   await atomic(client,[serverKey(guildId)],async tx=>{
    const server=readServer(tx.get(serverKey(guildId)));
    server.pendingLogs=server.pendingLogs.filter(e=>e.id!==entry.id);
    tx.put(serverKey(guildId),server);
   });
   delivered++;
  }catch(err){logger.warn('Sand Coins purchase log delivery deferred',{guildId,error:err.message});break;}
 }
 return {delivered,pending:pending.length-delivered};
}
