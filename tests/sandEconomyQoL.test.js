import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandWalletPanel,sandHistoryMatches } from '../src/utils/sandEconomyUi.js';
import { getSandWallet,setSandNotificationPreference,markSandDailyReminder } from '../src/services/sandCoinsService.js';
import { sendSandEconomyNotice } from '../src/services/sandEconomyNotifications.js';
import shopHandlers from '../src/interactions/buttons/sandEconomyActions.js';

const userId='111111111111111111';
const walletKey='beacon:sandcoins:v1:wallet:'+userId;
function mockClient(){
 const values=new Map();
 const pool={async connect(){return {
  async query(sql,args=[]){
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(sql.startsWith('SELECT value FROM'))return {rows:values.has(args[0])?[{value:structuredClone(values.get(args[0]))}]:[]};
   if(sql.startsWith('INSERT INTO')){values.set(args[0],JSON.parse(args[1]));return {rows:[]};}
   throw new Error('Unexpected SQL '+sql);
  },release(){},
 };}};
 let sent=0;
 const client={db:{db:{pool,isAvailable:()=>true},get:async(key,def=null)=>values.get(key)??def},
  users:{async fetch(){return {bot:false,async send(){sent++;}}}}};
 return {client,values,sent:()=>sent};
}
test('private wallet dashboard shows real caps, UTC resets and navigation',async()=>{
 const {client,values}=mockClient();
 values.set(walletKey,{balance:1000,lifetime:1800,earnedToday:150,earnedWeek:450,
  day:'2026-10-28',week:'2026-10-26',history:[{kind:'quest',delta:25,at:'2026-10-28T00:00:00Z'}],
  dailyStreak:2,lastDailyClaimDate:'2026-10-27'});
 const view=await buildSandWalletPanel(client,userId,'home','all',0,new Date('2026-10-28T13:00:00Z'));
 const data=view.embeds[0].toJSON();
 assert.match(data.description,/1,000 SC available/);
 assert.match(data.fields[2].value,/150 SC \/ 200 SC/);
 assert.match(data.fields[3].value,/450 SC \/ 600 SC/);
 assert.ok(view.components.flatMap(r=>r.toJSON().components).some(c=>c.custom_id==='sand_wallet:daily'));
 const history=await buildSandWalletPanel(client,userId,'history','earned',0,new Date('2026-10-28T13:00:00Z'));
 assert.match(history.embeds[0].toJSON().description,/Quest reward/);
 assert.ok(history.components.some(r=>r.toJSON().components.some(c=>c.custom_id==='sand_wallet:history:payments:0')));
});
test('history filtering does not mutate or invent balance',()=>{
 const payment={kind:'payment_sent',delta:-100},daily={kind:'daily',delta:45},treasury={kind:'treasury_donation',delta:-50};
 assert.equal(sandHistoryMatches(payment,'payments'),true);
 assert.equal(sandHistoryMatches(daily,'earned'),true);
 assert.equal(sandHistoryMatches(treasury,'treasury'),true);
 assert.equal(sandHistoryMatches(payment,'earned'),false);
 assert.equal(sandHistoryMatches(daily,'spent'),false);
});
test('notification preferences persist globally and default to off',async()=>{
 const {client,values}=mockClient();
 let wallet=await getSandWallet(client,userId);
 assert.equal(wallet.notifications.payments,false);
 await setSandNotificationPreference(client,userId,'payments',true);
 await setSandNotificationPreference(client,userId,'daily',true);
 wallet=await getSandWallet(client,userId);
 assert.equal(wallet.notifications.payments,true);
 assert.equal(wallet.notifications.daily,true);
 assert.deepEqual(values.get('beacon:sandcoins:v1:notifications:daily-users'),[userId]);
 await setSandNotificationPreference(client,userId,'daily',false);
 assert.deepEqual(values.get('beacon:sandcoins:v1:notifications:daily-users'),[]);
});
test('DM notices are opt-in, and streak reminder is idempotent',async()=>{
 const {client,values,sent}=mockClient();
 assert.equal(await sendSandEconomyNotice(client,userId,'payments','Test'),false);
 assert.equal(sent(),0);
 await setSandNotificationPreference(client,userId,'payments',true);
 assert.equal(await sendSandEconomyNotice(client,userId,'payments','Test'),true);
 assert.equal(sent(),1);
 values.set(walletKey,{...values.get(walletKey),dailyStreak:2,lastDailyClaimDate:'2026-10-27'});
 await setSandNotificationPreference(client,userId,'daily',true);
 assert.equal(await markSandDailyReminder(client,userId,'2026-10-28'),true);
 assert.equal(await markSandDailyReminder(client,userId,'2026-10-28'),false);
});
test('purchase confirmation remains bound to the buyer, with no new slash commands',async()=>{
 assert.deepEqual(shopHandlers.map(handler=>handler.name),[
  'sand_wallet','sand_shop_buy','sand_shop_confirm','sand_shop_cancel','sand_shop_equip']);
 const cancel=shopHandlers.find(handler=>handler.name==='sand_shop_cancel');
 let result=null;
 await cancel.execute({guildId:'222222222222222222',user:{id:userId},
  async update(payload){result=payload;}}, {}, [userId]);
 assert.match(result.content,/cancelled/);
});
