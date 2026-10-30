import test from 'node:test';
import assert from 'node:assert/strict';
import { getEndedGiveaways, markGiveawayEnded, isTransientGiveawayDatabaseError } from '../src/utils/database.js';

const down=(code)=>Object.assign(new Error('connect failed'),{code});
const aggregate=(code)=>new AggregateError([down(code)],'connect failed');
const makeClient=(query,mode='postgresql')=>{
  const calls={sql:0,list:0,get:0};
  const client={db:{
    db:{pool:{async query(){calls.sql++;if(query instanceof Error)throw query;return query;}},isAvailable:()=>true},
    getConnectionType:()=>mode,
    async list(){calls.list++;return ['guild:123:giveaways'];},
    async get(){calls.get++;return {};},
  }};
  return {client,calls};
};

test('transient PostgreSQL errors include nested pg-pool AggregateError causes',()=>{
 for(const code of ['ETIMEDOUT','ECONNREFUSED','ECONNRESET','57P01','08006']){
  assert.equal(isTransientGiveawayDatabaseError(aggregate(code)),true,code);
 }
 assert.equal(isTransientGiveawayDatabaseError(new Error('syntax error at or near WHERE')),false);
 assert.equal(isTransientGiveawayDatabaseError({code:'42P01'}),false);
});
test('sleeping PostgreSQL does not double-query the same outage through KV',async()=>{
 for(const code of ['ETIMEDOUT','ECONNREFUSED']){
  const {client,calls}=makeClient(aggregate(code));
  assert.deepEqual(await getEndedGiveaways(client),[]);
  assert.deepEqual(calls,{sql:1,list:0,get:0},'The KV fallback hits the same sleeping DB');
 }
});
test('unavailable persistent pool waits, instead of attempting a KV scan/write',async()=>{
 const {client,calls}=makeClient({rows:[]});
 client.db.db.pool=null;client.db.db.isAvailable=()=>false;
 assert.deepEqual(await getEndedGiveaways(client),[]);
 assert.equal(await markGiveawayEnded(client,'giveaway1',{guildId:'123',messageId:'abc'}),false);
 assert.deepEqual(calls,{sql:0,list:0,get:0});
});
test('next scheduled run resumes persisted giveaway check on recovery',async()=>{
 const record={id:'aaa',guild_id:'123',message_id:'abc',data:{messageId:'abc'},ends_at:new Date()};
 const {client,calls}=makeClient({rows:[record]});
 assert.deepEqual(await getEndedGiveaways(client),[record]);
 assert.equal(calls.sql,1);
 assert.equal(calls.list,0);
});
test('real query/schema failures remain visible, never reported as an empty list',async()=>{
 const {client,calls}=makeClient(Object.assign(new Error('relation missing'),{code:'42P01'}));
 await assert.rejects(getEndedGiveaways(client),/relation missing/);
 assert.deepEqual(calls,{sql:1,list:0,get:0});
});
test('non-Postgres test storage retains its intended KV fallback',async()=>{
 const calls={list:0,get:0};
 const client={db:{
  async list(){calls.list++;return ['guild:123:giveaways'];},
  async get(){calls.get++;return {abc:{messageId:'abc',endTime:Date.now()-5000,ended:false}};},
 }};
 const records=await getEndedGiveaways(client);
 assert.equal(records.length,1);
 assert.equal(records[0].message_id,'abc');
 assert.deepEqual(calls,{list:1,get:1});
});
