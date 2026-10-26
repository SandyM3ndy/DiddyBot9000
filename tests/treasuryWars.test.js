import test from 'node:test';
import assert from 'node:assert/strict';
import { getSandWallet,sandWalletStorageKey } from '../src/services/sandCoinsService.js';
import {
 getTreasury,getTreasuryEffects,treasuryStorageKey,treasuryCapacity,TREASURY_DEFENCES,
 treasuryDonate,treasuryPayout,toggleTreasuryHeists,purchaseTreasuryItem,activateTreasuryPotion,
 createTreasuryHeist,resolveTreasuryHeist,wallAt,TREASURY_MIN_HEIST,TREASURY_RAID_WINDOW_MS,
} from '../src/services/treasuryService.js';
import treasuryCommand,{buildTreasuryPanel} from '../src/commands/Community/treasury.js';
import heistCommand,{buildHeistPanel,buildHeistChallenge} from '../src/commands/Community/heist.js';
import treasuryButtons from '../src/interactions/buttons/treasuryDashboard.js';
import treasuryModals from '../src/interactions/modals/treasuryForm.js';
import heistButtons from '../src/interactions/buttons/treasuryHeist.js';

const guildA='111111111111111111',guildB='222222222222222222',
 guildC='333333333333333333',owner='444444444444444444',member='555555555555555555',
 peer='666666666666666666';
let counter=700000000000000000n;
function requestId(){return String(counter++);}
function fixture(){
 const values=new Map();
 const names=[{id:guildA,name:'Sand Castle',ownerId:owner},
  {id:guildB,name:'Crimson Kingdom',ownerId:peer},
  {id:guildC,name:'Another Guild',ownerId:peer}];
 const query=async(sql,args=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||/pg_advisory_(xact_)?(un)?lock/.test(sql))return {rows:[]};
  if(sql.startsWith('SELECT value FROM')){
   return {rows:values.has(args[0])?[{value:structuredClone(values.get(args[0]))}]:[]};
  }
  if(sql.startsWith('INSERT INTO')){
   values.set(args[0],JSON.parse(args[1]));return {rows:[]};
  }
  throw new Error('Unsupported PostgreSQL query: '+sql);
 };
 const pool={options:{max:8},connect:async()=>({query,release(){}})};
 const db={db:{pool,isAvailable:()=>true},
  async get(key,other=null){return values.has(key)?structuredClone(values.get(key)):other;},
  async set(key,val){values.set(key,structuredClone(val));return true;},
  async list(prefix){return [...values.keys()].filter(x=>x.startsWith(prefix));}};
 const client={db,guilds:{cache:new Map(names.map(n=>[n.id,n]))}};
 values.set(sandWalletStorageKey(member),{balance:30000,lifetime:30000,history:[]});
 values.set(sandWalletStorageKey(owner),{balance:1000,lifetime:1000,history:[]});
 values.set(sandWalletStorageKey(peer),{balance:30000,lifetime:30000,history:[]});
 for(const name of names)values.set('guild:'+name.id+':progression',{level:50});
 return {client,values};
}
test('only two slash entrypoints, with interaction-driven dashboards',async()=>{
 assert.equal(treasuryCommand.data.name,'treasury');
 assert.equal(heistCommand.data.name,'heist');
 assert.deepEqual(treasuryButtons.map(x=>x.name),['treasury','treasury_confirm']);
 assert.equal(treasuryModals.name,'treasury_form');
 assert.deepEqual(heistButtons.map(x=>x.name),['heist_launch','heist_refresh','heist_hit']);
 const {client}=fixture();
 const panel=await buildTreasuryPanel(client,guildA);
 assert.equal(panel.components.length,2);
 assert.ok(panel.components[1].toJSON().components.find(b=>b.custom_id==='treasury:donate'));
 assert.ok(panel.components[1].toJSON().components.find(b=>b.custom_id==='treasury:payout'));
 const shop=await buildTreasuryPanel(client,guildA,'shop');
 assert.match(shop.embeds[0].toJSON().description,/2× Sand Coins/);
 assert.match(shop.embeds[0].toJSON().description,/2× Server XP/);
 const raids=await buildHeistPanel(client,guildA);
 assert.equal(raids.components[0].toJSON().components[0].disabled,true);
});
test('server-level capacity scales automatically without modifying personal inventory',()=>{
 assert.equal(treasuryCapacity(1),2500);
 assert.equal(treasuryCapacity(5),5000);
 assert.equal(treasuryCapacity(10),10000);
 assert.equal(treasuryCapacity(20),20000);
 assert.equal(treasuryCapacity(30),35000);
 assert.equal(treasuryCapacity(50),60000);
 assert.equal(TREASURY_MIN_HEIST,500);
 assert.deepEqual(TREASURY_DEFENCES.map(x=>x.loot),[15,12,9,6,3]);
});
test('donations and owner payouts conserve coins and reject idempotent replays',async()=>{
 const {client,values}=fixture();
 const tx=requestId();
 const donation=await treasuryDonate(client,{guildId:guildA,userId:member,amount:4000,requestId:tx});
 assert.equal(donation.balance,4000);
 assert.equal((await getSandWallet(client,member)).balance,26000);
 const duplicate=await treasuryDonate(client,{guildId:guildA,userId:member,amount:4000,requestId:tx});
 assert.equal(duplicate.duplicate,true);
 assert.equal((await getTreasury(client,guildA)).balance,4000);
 const paid=await treasuryPayout(client,{guildId:guildA,ownerId:owner,recipientId:owner,amount:500,requestId:requestId()});
 assert.equal(paid.balance,3500);
 assert.equal((await getSandWallet(client,owner)).balance,1500);
 assert.equal((await getSandWallet(client,member)).balance+(await getSandWallet(client,owner)).balance+
  (await getTreasury(client,guildA)).balance,26000+1500+3500);
 assert.equal(values.get(treasuryStorageKey(guildA)).history.length,2);
 const errors=await Promise.allSettled([
  treasuryDonate(client,{guildId:guildA,userId:member,amount:20000,requestId:requestId()}),
  treasuryDonate(client,{guildId:guildA,userId:member,amount:20000,requestId:requestId()}),
  ]);
 assert.equal(errors.filter(x=>x.status==='fulfilled').length,1,'only one simultaneous transfer can spend the same wallet funds');
 assert.equal(errors.filter(x=>x.status==='rejected').length,1);
 assert.equal((await getSandWallet(client,member)).balance,6000);
 assert.equal((await getTreasury(client,guildA)).balance,23500);
});
test('500 SC required for heist opt-in; 24h toggle cooldown and minimum bonus balance',async()=>{
 const {client}=fixture();
 await treasuryDonate(client,{guildId:guildA,userId:member,amount:499,requestId:requestId()});
 await assert.rejects(toggleTreasuryHeists(client,{guildId:guildA,actorId:owner,now:1000000000000}),/MINIMUM_500_TREASURY/);
 await treasuryDonate(client,{guildId:guildA,userId:member,amount:1,requestId:requestId()});
 assert.equal((await toggleTreasuryHeists(client,{guildId:guildA,actorId:owner,now:1000000000000})).enabled,true);
 assert.equal((await getTreasuryEffects(client,guildA)).xpMultiplier,1.2);
 await assert.rejects(toggleTreasuryHeists(client,{guildId:guildA,actorId:owner,now:1000000000001}),/HEIST_TOGGLE_COOLDOWN/);
 await assert.rejects(treasuryPayout(client,{guildId:guildA,ownerId:owner,recipientId:member,amount:1,requestId:requestId()}),/HEIST_RESERVE_REQUIRED/);
 // A raid may temporarily drop a participant below 500, pausing the bonus.
 const original=await getTreasury(client,guildA);
 await client.db.set(treasuryStorageKey(guildA),{...original,balance:499});
 assert.equal((await getTreasuryEffects(client,guildA)).xpMultiplier,1);
 assert.equal((await toggleTreasuryHeists(client,{guildId:guildA,actorId:owner,now:1000000000000+24*3600000})).enabled,false);
});
test('only two purchasable potions; boosts persist and expire at 2h without stacks',async()=>{
 const {client}=fixture();
 await treasuryDonate(client,{guildId:guildA,userId:member,amount:20000,requestId:requestId()});
 const a=await purchaseTreasuryItem(client,{guildId:guildA,actorId:owner,kind:'potion',itemId:'coins',requestId:requestId()});
 const b=await purchaseTreasuryItem(client,{guildId:guildA,actorId:owner,kind:'potion',itemId:'xp',requestId:requestId()});
 assert.equal(a.price,5000);
 assert.equal(b.price,7500);
 const activated=await activateTreasuryPotion(client,{guildId:guildA,actorId:owner,itemId:'xp',now:Date.now()});
 assert.equal(activated.activeUntil> Date.now()+7100000,true);
 assert.equal((await getTreasuryEffects(client,guildA)).xpMultiplier,2);
 await assert.rejects(activateTreasuryPotion(client,{guildId:guildA,actorId:owner,itemId:'xp'}),/NO_POTION|POTION_ALREADY_ACTIVE/);
 await activateTreasuryPotion(client,{guildId:guildA,actorId:owner,itemId:'coins',now:Date.now()});
 assert.equal((await getTreasuryEffects(client,guildA)).sandMultiplier,2);
 assert.equal((await getTreasury(client,guildA)).potions.coins,0);
 await assert.rejects(purchaseTreasuryItem(client,{guildId:guildA,actorId:owner,kind:'potion',itemId:'fake',requestId:requestId()}),/INVALID_POTION/);
});
test('one moving wall, three buttons, one hit; caught raid takes 3% with persistent target shield',async()=>{
 const {client}=fixture();
 await treasuryDonate(client,{guildId:guildA,userId:member,amount:5000,requestId:requestId()});
 await treasuryDonate(client,{guildId:guildB,userId:peer,amount:5000,requestId:requestId()});
 const now=Date.now(),a=await toggleTreasuryHeists(client,{guildId:guildA,actorId:owner,now}),
  b=await toggleTreasuryHeists(client,{guildId:guildB,actorId:peer,now});
 assert.equal(a.enabled,true);assert.equal(b.enabled,true);
 const r=await createTreasuryHeist(client,{guildId:guildA,actorId:owner,raidId:requestId(),now:now+1000});
 assert.equal(r.raid.targetId,guildB);
 assert.equal(r.raid.endsAt-r.raid.startedAt,TREASURY_RAID_WINDOW_MS);
 assert.equal((wallAt(r.raid,r.raid.startedAt)+1)%3,wallAt(r.raid,r.raid.startedAt+1000));
 const payload=buildHeistChallenge(r.raid,r.targetName,r.defence,r.raid.startedAt+500);
 assert.equal(payload.components.length,2);
 assert.equal(payload.components[0].toJSON().components.filter(b=>b.label==='🧱').length,1);
 assert.equal(payload.components[1].toJSON().components.length,3);
 const right=wallAt(r.raid,r.raid.startedAt+500),wrong=(right+1)%3;
 const result=await resolveTreasuryHeist(client,{guildId:guildA,raidId:r.raid.id,actorId:owner,column:wrong,now:r.raid.startedAt+500});
 assert.equal(result.caught,true);assert.equal(result.hit,false);
 assert.equal(result.amount,150);
 assert.equal((await getTreasury(client,guildA)).balance,4850);
 assert.equal((await getTreasury(client,guildB)).balance,5150);
 const shield=await getTreasury(client,guildB);
 assert.equal(shield.shieldUntil,r.raid.startedAt+500+3*3600000);
 const second=await resolveTreasuryHeist(client,{guildId:guildA,raidId:r.raid.id,actorId:owner,column:wrong,now:r.raid.startedAt+600});
 assert.equal(second.duplicate,true);
 assert.equal((await getTreasury(client,guildA)).balance,4850);
 await assert.rejects(createTreasuryHeist(client,{guildId:guildA,actorId:owner,raidId:requestId(),now:now+3000}),/HEIST_COOLDOWN/);
});
