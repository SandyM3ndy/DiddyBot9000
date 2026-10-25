import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SAND_CATALOG,SAND_DAILY_LIMIT,SAND_WEEKLY_LIMIT,SAND_DAILY_STREAK_REWARDS,
 claimSandDaily,getSandDailyStatusFromWallet,
 getSandWallet,getSandServer,getSandAppearance,getSandLimitedStock,
 getSandGlobalLeaderboard,setSandLeaderboardHidden,
 grantQuestSandCoins,buySandDecoration,equipSandDecoration,deliverSandPurchaseLogs,
 transferSandCoins,offerSandTrade,resolveSandTrade,getSandTrade,getSandServerTradeOffers,deliverSandTradeLogs } from '../src/services/sandCoinsService.js';
import { eligibleSandContributors,recordQuestContribution,queueSharedSandRewards } from '../src/services/sandQuestRewards.js';
import { renderProgressionRankPng } from '../src/utils/progressionRankCard.js';
import sandCommand from '../src/commands/Community/sandcoins.js';
import dailyCommand from '../src/commands/Community/daily.js';

const u='111111111111111111',g1='222222222222222222',g2='333333333333333333';
function mockDatabase(){
 const values=new Map();
 const query=async(sql,args=[])=>{
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock'))
   return {rows:[]};
  if(sql.startsWith('SELECT value FROM'))return {rows:values.has(args[0])?[{value:structuredClone(values.get(args[0]))}]:[]};
  if(sql.startsWith('INSERT INTO')){values.set(args[0],JSON.parse(args[1]));return {rows:[]};}
  throw Error('Unexpected mock query: '+sql);
 };
 const pool={connect:async()=>({query,release(){}})};
 const db={db:{pool,isAvailable:()=>true},
  async get(key,def=null){return values.get(key)??def;},
  async list(prefix){return [...values.keys()].filter(key=>key.startsWith(prefix));}};
 return {db,values};
}
const walletKey=id=>'beacon:sandcoins:v1:wallet:'+id;

test('global quest claims are idempotent and constrained by UTC limits',async()=>{
 const {db}=mockDatabase();
 const first=await grantQuestSandCoins({db},{userId:u,guildId:g1,eventId:g1+':daily:2026-10-25:messages',amount:100});
 assert.equal(first.credited,100);
 const retry=await grantQuestSandCoins({db},{userId:u,guildId:g1,eventId:g1+':daily:2026-10-25:messages',amount:100});
 assert.equal(retry.credited,0);
 assert.equal(retry.duplicate,true);
 const second=await grantQuestSandCoins({db},{userId:u,guildId:g2,eventId:g2+':daily:2026-10-25:messages',amount:160});
 assert.equal(second.credited,SAND_DAILY_LIMIT-100);
 assert.equal((await getSandWallet({db},u)).balance,SAND_DAILY_LIMIT);
 assert.equal(SAND_WEEKLY_LIMIT>=SAND_DAILY_LIMIT,true);
});

test('global wallet can purchase for another guild atomically; server owns inventory',async()=>{
 const {db,values}=mockDatabase();
 values.set(walletKey(u),{balance:2000,lifetime:2500,earnedToday:0,earnedWeek:0,day:'',week:'',history:[]});
 const buy=await buySandDecoration({db},{userId:u,guildId:g2,itemId:'sunset',purchaseId:'444444444444444444'});
 assert.equal(buy.balance,1700);
 assert.equal((await getSandServer({db},g2)).inventory.includes('sunset'),true);
 assert.equal((await getSandServer({db},g1)).inventory.includes('sunset'),false);
 assert.equal((await getSandWallet({db},u)).balance,1700);
 const retry=await buySandDecoration({db},{userId:u,guildId:g2,itemId:'sunset',purchaseId:'444444444444444444'});
 assert.equal(retry.duplicate,true);
 assert.equal((await getSandWallet({db},u)).balance,1700);
 const duplicateItem=await buySandDecoration({db},{userId:u,guildId:g2,itemId:'sunset',purchaseId:'555555555555555555'});
 assert.equal(duplicateItem.error,'ALREADY_OWNED');
 const equip=await equipSandDecoration({db},{guildId:g2,itemId:'sunset',slot:'background',actorId:u});
 assert.equal(equip.appearance.background,'sunset');
 assert.equal(getSandAppearance(await getSandServer({db},g1)).background,null);
 const remove=await equipSandDecoration({db},{guildId:g2,itemId:null,slot:'background',actorId:u});
 assert.equal(remove.appearance.background,null);
 assert.equal((await getSandServer({db},g2)).inventory.includes('sunset'),true);
});

test('limited editions are globally capped, and exhausted stock does not spend coins',async()=>{
 const {db,values}=mockDatabase();
 const limited=SAND_CATALOG.find(item=>item.id==='royal');
 assert.equal(limited.limit,5);
 values.set(walletKey(u),{balance:5000,lifetime:5000});
 values.set('beacon:sandcoins:v1:stock:royal',5);
 const result=await buySandDecoration({db},{userId:u,guildId:g1,itemId:'royal',purchaseId:'777777777777777777'});
 assert.equal(result.error,'SOLD_OUT');
 assert.equal((await getSandWallet({db},u)).balance,5000);
 assert.equal((await getSandLimitedStock({db},'royal')).remaining,0);
});

test('rank card image changes visually when server-owned cosmetics are equipped',()=>{
 const params={name:'SAND CASTLE',rank:1,level:9,xp:45000,progress:65};
 const plain=renderProgressionRankPng(params);
 const decorated=renderProgressionRankPng({...params,appearance:{background:'galaxy',border:'gold',tag:'royal'}});
 assert.equal(plain.subarray(1,4).toString(),'PNG');
 assert.notEqual(createHash('sha256').update(plain).digest('hex'),createHash('sha256').update(decorated).digest('hex'));
});

test('contributor eligibility limits payouts to meaningful quest participants',()=>{
 const q={id:'messages',metric:'messages',target:20,difficulty:'Medium'};
 const eligible=eligibleSandContributors(q,{[u]:3,[g1]:1,[g2]:2});
 assert.deepEqual(eligible,[u,g2]);
 const data={lastQuestDay:'2026-10-25',dailyQuests:[{...q,completed:false}],
  weekly:{week:'2026-10-19',quests:[]},sandContributions:{day:'2026-10-25',week:'2026-10-19',daily:{},weekly:{}}};
 recordQuestContribution(data,g1,'message',{userId:u},0,5);
 recordQuestContribution(data,g1,'message',{userId:u},0,5);
 queueSharedSandRewards(data,g1,[q],[]);
 assert.equal(data.sandPendingPayouts.length,1);
 assert.equal(data.sandPendingPayouts[0].userId,u);
 queueSharedSandRewards(data,g1,[q],[]);
 assert.equal(data.sandPendingPayouts.length,1);
});

test('command only contains sandboxed server shop and does not expose purchases as admin controls',()=>{
 assert.equal(sandCommand.data.toJSON().name,'sandcoins');
 const names=sandCommand.data.toJSON().options.map(x=>x.name);
 assert.deepEqual(names,['wallet','daily','leaderboard','privacy','shop','inventory','buy','equip','unequip','pay','trade']);
 const group=sandCommand.data.toJSON().options.find(x=>x.name==='trade');
 assert.equal(group.type,2);
 assert.deepEqual(group.options.map(x=>x.name),['offer','inbox','status','accept','decline','cancel']);
 assert.equal(dailyCommand.data.toJSON().name,'daily');
 assert.ok(SAND_CATALOG.every(item=>['background','border','tag'].includes(item.type)));
});

test('only members who advance quest progress count as eligible contributors',()=>{
 const q={id:'unique',metric:'uniqueMembers',target:2,progress:1,completed:false};
 const data={dailyQuests:[q],weekly:{quests:[]},
  sandContributions:{daily:{},weekly:{}}};
 recordQuestContribution(data,g1,'message',{userId:u},0,5,{unique:1});
 assert.equal(data.sandContributions.daily.unique,undefined);
 q.progress=2;
 recordQuestContribution(data,g1,'message',{userId:u},0,5,{unique:1});
 assert.equal(data.sandContributions.daily.unique[u],1);
});

test('purchase posts a server-specific audit log and clears the durable pending notification',async()=>{
 const {db,values}=mockDatabase();
 values.set(walletKey(u),{balance:1000,lifetime:1000});
 const auditId='999999999999999999',delivered=[];
 values.set('guild:'+g2+':config',{logging:{enabled:true,channels:{audit:auditId}}});
 const channel={send:async payload=>{delivered.push(payload);return true;}};
 const guild={id:g2,name:'Castle',channels:{cache:new Map([[auditId,channel]])}};
 const client={db,guilds:{cache:new Map([[g2,guild]]),fetch:async()=>guild}};
 await buySandDecoration(client,{userId:u,guildId:g2,itemId:'sunset',purchaseId:'888888888888888888'});
 assert.equal((await getSandServer(client,g2)).pendingLogs.length,1);
 const result=await deliverSandPurchaseLogs(client,g2);
 assert.equal(result.delivered,1);
 assert.equal(delivered.length,1);
 assert.match(delivered[0].embeds[0].toJSON().description,/server/);
 assert.equal((await getSandServer(client,g2)).pendingLogs.length,0);
});

test('failed audit delivery leaves the purchase notification queued for recovery',async()=>{
 const {db,values}=mockDatabase();
 values.set(walletKey(u),{balance:1000,lifetime:1000});
 const auditId='999999999999999999';
 values.set('guild:'+g2+':config',{logging:{enabled:true,channels:{audit:auditId}}});
 const channel={send:async()=>{throw new Error('Discord unavailable')}};
 const guild={id:g2,channels:{cache:new Map([[auditId,channel]])}};
 const client={db,guilds:{cache:new Map([[g2,guild]]),fetch:async()=>guild}};
 await buySandDecoration(client,{userId:u,guildId:g2,itemId:'sunset',purchaseId:'888888888888888888'});
 const result=await deliverSandPurchaseLogs(client,g2);
 assert.equal(result.delivered,0);
 assert.equal((await getSandServer(client,g2)).pendingLogs.length,1);
});

test('global lifetime coin rankings preserve earned status after spending and honour opt-out',async()=>{
 const {db,values}=mockDatabase(),v='444444444444444444';
 values.set(walletKey(u),{balance:20,lifetime:1000});
 values.set(walletKey(v),{balance:800,lifetime:800});
 const board=await getSandGlobalLeaderboard({db});
 assert.deepEqual(board.map(x=>x.userId),[u,v]);
 await setSandLeaderboardHidden({db},u,true);
 assert.deepEqual((await getSandGlobalLeaderboard({db})).map(x=>x.userId),[v]);
 assert.equal((await getSandWallet({db},u)).balance,20);
});

test('daily streak claims exactly once per UTC calendar day, regardless of guild',async()=>{
 assert.deepEqual([...SAND_DAILY_STREAK_REWARDS],[35,45,55,65,75,85,100]);
 const {db,values}=mockDatabase();
 const client={db};
 const d1=new Date('2027-01-01T23:59:59.000Z');
 const first=await claimSandDaily(client,{userId:u,now:d1});
 assert.equal(first.claimed,true);
 assert.equal(first.streak,1);
 assert.equal(first.amount,35);
 const duplicate=await claimSandDaily(client,{userId:u,now:new Date('2027-01-01T23:59:59.999Z')});
 assert.equal(duplicate.claimed,false);
 assert.equal(duplicate.amount,0);
 assert.equal(duplicate.balance,35);
 assert.equal(values.get(walletKey(u)).history.length,1);
 const next=await claimSandDaily(client,{userId:u,now:new Date('2027-01-02T00:00:01Z')});
 assert.equal(next.streak,2);
 assert.equal(next.amount,45);
 assert.equal(next.balance,80);
 assert.equal(next.nextClaimAt,Date.parse('2027-01-03T00:00:00Z')/1000);
 assert.equal((await getSandWallet(client,u)).lifetime,80);
 // The new /daily bonus never consumes the quest earning daily/weekly allowances.
 assert.equal(values.get(walletKey(u)).earnedToday,0);
 assert.equal(values.get(walletKey(u)).earnedWeek,0);
});

test('day seven is the maximum daily payout; missing one day resets to day one',async()=>{
 const client={db:mockDatabase().db};
 let sum=0;
 for(let day=1;day<=9;day++){
  const now=new Date('2027-01-'+String(day).padStart(2,'0')+'T12:00:00Z');
  const r=await claimSandDaily(client,{userId:u,now});
  const amount=SAND_DAILY_STREAK_REWARDS[Math.min(day,7)-1];
  assert.equal(r.claimed,true);
  assert.equal(r.streak,Math.min(day,7));
  assert.equal(r.amount,amount);
  sum+=amount;
 }
 const wallet=await getSandWallet(client,u);
 assert.equal(wallet.lifetime,sum);
 assert.equal(wallet.balance,sum);
 assert.equal(getSandDailyStatusFromWallet(wallet,new Date('2027-01-10T03:00:00Z')).nextStreak,7);
 const stale=getSandDailyStatusFromWallet(wallet,new Date('2027-01-11T03:00:00Z'));
 assert.equal(stale.streak,0);
 assert.equal(stale.nextStreak,1);
 assert.equal(stale.nextReward,35);
 const reset=await claimSandDaily(client,{userId:u,now:new Date('2027-01-11T23:00:00Z')});
 assert.equal(reset.streak,1);
 assert.equal(reset.amount,35);
 const resumed=await claimSandDaily(client,{userId:u,now:new Date('2027-01-12T04:00:00Z')});
 assert.equal(resumed.streak,2);
 assert.equal(resumed.amount,45);
});

test('daily reward and daily streak status persist across DB client instances and preserve quest payout caps',async()=>{
 const {db,values}=mockDatabase();
 await claimSandDaily({db},{userId:u,now:new Date('2027-02-01T05:00:00Z')});
 const reopened={db};
 assert.equal((await claimSandDaily(reopened,{userId:u,now:new Date('2027-02-01T22:00:00Z')})).claimed,false);
 const paid=await grantQuestSandCoins(reopened,{
  userId:u,guildId:g1,eventId:g1+':daily:2027-02-01:messages',amount:200,
 });
 assert.equal(paid.credited,200);
 assert.equal((await getSandWallet(reopened,u)).balance,235);
 const next=await claimSandDaily(reopened,{userId:u,now:new Date('2027-02-02T00:00:00Z')});
 assert.equal(next.amount,45);
 assert.equal((await getSandWallet(reopened,u)).balance,280);
 assert.equal(values.get(walletKey(u)).history.filter(h=>h.kind==='daily').length,2);
});

test('member payments are atomic, idempotent, non-minting and preserve lifetime earnings',async()=>{
 const {db,values}=mockDatabase(),v='444444444444444444';
 values.set(walletKey(u),{balance:800,lifetime:1000,dailyStreak:4,lastDailyClaimDate:'2026-10-25'});
 values.set(walletKey(v),{balance:100,lifetime:150});
 const client={db};
 const first=await transferSandCoins(client,{fromId:u,toId:v,amount:300,transferId:'777777777777777777'});
 assert.equal(first.fromBalance,500);assert.equal(first.toBalance,400);
 const duplicate=await transferSandCoins(client,{fromId:u,toId:v,amount:300,transferId:'777777777777777777'});
 assert.equal(duplicate.duplicate,true);
 assert.equal((await getSandWallet(client,u)).balance,500);
 assert.equal((await getSandWallet(client,v)).balance,400);
 assert.equal((await getSandWallet(client,u)).lifetime,1000);
 assert.equal((await getSandWallet(client,v)).lifetime,150);
 assert.equal((await getSandWallet(client,u)).dailyStreak,4);
 assert.equal(values.get(walletKey(u)).history.filter(h=>h.kind==='payment_sent').length,1);
 assert.equal(values.get(walletKey(v)).history.filter(h=>h.kind==='payment_received').length,1);
 const reused=await transferSandCoins(client,{fromId:u,toId:v,amount:250,transferId:'777777777777777777'});
 assert.equal(reused.error,'TRANSFER_ID_REUSED');
 const broke=await transferSandCoins(client,{fromId:u,toId:v,amount:600,transferId:'666666666666666666'});
 assert.equal(broke.error,'INSUFFICIENT_FUNDS');
 assert.equal((await getSandWallet(client,u)).balance,500);
 await assert.rejects(transferSandCoins(client,{fromId:u,toId:u,amount:1,transferId:'666666666666666667'}),/yourself/);
 await assert.rejects(transferSandCoins(client,{fromId:u,toId:v,amount:10001,transferId:'666666666666666668'}),/1–10,000/);
});

test('cross-server inventory swaps require owners of both guilds and only settle once',async()=>{
 const {db,values}=mockDatabase();
 const ownerA='444444444444444444',ownerB='555555555555555555',tradeId='777777777777777777';
 values.set('beacon:sandcoins:v1:server:'+g1,
  {inventory:['royal'],equipped:{tag:'royal'},purchases:[],pendingLogs:[]});
 values.set('beacon:sandcoins:v1:server:'+g2,
  {inventory:['galaxy'],equipped:{background:'galaxy'},purchases:[],pendingLogs:[]});
 const client={db},now=new Date('2027-01-10T10:00:00Z');
 const offered=await offerSandTrade(client,{tradeId,fromGuildId:g1,toGuildId:g2,fromOwnerId:ownerA,toOwnerId:ownerB,
  offeredItem:'royal',requestedItem:'galaxy',now});
 assert.equal(offered.offer.status,'pending');
 assert.equal((await getSandServer(client,g1)).inventory.includes('royal'),true);
 assert.equal((await getSandServer(client,g2)).inventory.includes('galaxy'),true);
 assert.equal((await getSandServerTradeOffers(client,g2)).length,0); // historical offer not current
 const denied=await resolveSandTrade(client,{tradeId,actorId:ownerA,actingGuildId:g1,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'accept',now});
 assert.equal(denied.error,'OWNER_ONLY');
 const transfer=await resolveSandTrade(client,{tradeId,actorId:ownerB,actingGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'accept',now});
 assert.equal(transfer.offer.status,'completed');
 assert.deepEqual((await getSandServer(client,g1)).inventory,['galaxy']);
 assert.deepEqual((await getSandServer(client,g2)).inventory,['royal']);
 assert.equal((await getSandServer(client,g1)).equipped.tag,null);
 assert.equal((await getSandServer(client,g2)).equipped.background,null);
 assert.equal((await getSandTrade(client,tradeId)).status,'completed');
 assert.equal((await getSandServer(client,g1)).pendingTradeLogs.length,2);
 assert.equal((await getSandServer(client,g2)).pendingTradeLogs.length,2);
 const duplicate=await resolveSandTrade(client,{tradeId,actorId:ownerB,actingGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'accept',now});
 assert.equal(duplicate.error,'TRADE_NOT_PENDING');
 assert.deepEqual((await getSandServer(client,g1)).inventory,['galaxy']);
});

test('trade rejects expired offers, changed owners and inventory changes; cancellation preserves inventory',async()=>{
 const client={db:mockDatabase().db};
 const values=client.db.db.pool; // store inventory using purchase transactions instead
 const ownerA='444444444444444444',ownerB='555555555555555555';
 // Buy cosmetics into distinct servers with wallets fully funded.
 const s=await client.db.get('beacon:sandcoins:v1:server:'+g1,null);
 assert.equal(s,null);
 const {db,values:store}=mockDatabase();client.db=db;
 store.set('beacon:sandcoins:v1:server:'+g1,{inventory:['gold']});
 store.set('beacon:sandcoins:v1:server:'+g2,{inventory:['emerald']});
 const now=new Date('2027-01-10T10:00:00Z');
 const base={fromGuildId:g1,toGuildId:g2,fromOwnerId:ownerA,toOwnerId:ownerB,
  offeredItem:'gold',requestedItem:'emerald',now};
 const first=await offerSandTrade(client,{...base,tradeId:'777777777777777777'});
 assert.ok(first.offer);
 const ownerChanged=await resolveSandTrade(client,{tradeId:first.offer.id,actorId:ownerB,actingGuildId:g2,
  fromOwnerId:'666666666666666666',toOwnerId:ownerB,decision:'accept',now});
 assert.equal(ownerChanged.error,'OWNERSHIP_CHANGED');
 const expired=await resolveSandTrade(client,{tradeId:first.offer.id,actorId:ownerB,actingGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'accept',now:new Date('2027-01-12T12:00:00Z')});
 assert.equal(expired.error,'TRADE_EXPIRED');
 const second=await offerSandTrade(client,{...base,tradeId:'777777777777777778'});
 store.set('beacon:sandcoins:v1:server:'+g1,{...(await getSandServer(client,g1)),inventory:[]});
 const vanished=await resolveSandTrade(client,{tradeId:second.offer.id,actorId:ownerB,actingGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'accept',now});
 assert.equal(vanished.error,'INVENTORY_CHANGED');
 const cancelled=await resolveSandTrade(client,{tradeId:second.offer.id,actorId:ownerA,actingGuildId:g1,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'cancel',now});
 assert.equal(cancelled.offer.status,'cancelled');
 assert.equal((await getSandServer(client,g2)).inventory.includes('emerald'),true);
});

test('trade cannot introduce a duplicate inventory decoration or fake minting',async()=>{
 const {db,values}=mockDatabase(),client={db};
 const ownerA='444444444444444444',ownerB='555555555555555555';
 values.set('beacon:sandcoins:v1:server:'+g1,{inventory:['royal']});
 values.set('beacon:sandcoins:v1:server:'+g2,{inventory:['royal','gold']});
 const result=await offerSandTrade(client,{tradeId:'777777777777777777',fromGuildId:g1,toGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,offeredItem:'royal',requestedItem:'gold'});
 assert.equal(result.error,'DUPLICATE_INVENTORY');
 assert.equal((await getSandServer(client,g2)).inventory.filter(x=>x==='royal').length,1);
});

test('completed trades leave durable audit notifications for both guilds',async()=>{
 const {db,values}=mockDatabase();
 const ownerA='444444444444444444',ownerB='555555555555555555';
 values.set('beacon:sandcoins:v1:server:'+g1,{inventory:['gold']});
 values.set('beacon:sandcoins:v1:server:'+g2,{inventory:['emerald']});
 const auditId='999999999999999999',log=[];
 for(const guildId of [g1,g2])values.set('guild:'+guildId+':config',{logging:{enabled:true,channels:{audit:auditId}}});
 const guilds=[g1,g2].map(id=>({id,channels:{cache:new Map([[auditId,{
  send:async payload=>{log.push({id,payload});return true;}
 }]])}}));
 const client={db,guilds:{cache:new Map(guilds.map(g=>[g.id,g])),fetch:async id=>guilds.find(g=>g.id===id)}};
 const now=new Date('2027-01-10T10:00:00Z');
 const offered=await offerSandTrade(client,{tradeId:'777777777777777777',fromGuildId:g1,toGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,offeredItem:'gold',requestedItem:'emerald',now});
 await resolveSandTrade(client,{tradeId:offered.offer.id,actorId:ownerB,actingGuildId:g2,
  fromOwnerId:ownerA,toOwnerId:ownerB,decision:'accept',now});
 await deliverSandTradeLogs(client,g1);
 await deliverSandTradeLogs(client,g2);
 assert.equal(log.length,4);
 assert.equal((await getSandServer(client,g1)).pendingTradeLogs.length,0);
 assert.equal((await getSandServer(client,g2)).pendingTradeLogs.length,0);
 assert.match(log[0].payload.embeds[0].toJSON().title,/Inventory Trade/);
});
