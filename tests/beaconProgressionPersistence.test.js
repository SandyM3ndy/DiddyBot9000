import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerProgression, rerollDailyQuest, mutateServerProgression,
  registerFoundingServers, getFoundingBadge, contributorRanking, utcWeekKey,
} from '../src/services/serverProgressionService.js';
import { renderProgressionRankPng } from '../src/utils/progressionRankCard.js';

function mockClient(store=new Map(),ids=['111111111111111111','222222222222222222']) {
 const guilds=new Map(ids.map((id,i)=>[id,{id,memberCount:4,joinedTimestamp:i+1,name:'Test Server '+i}]));
 return {
  guilds:{cache:guilds},
  db:{
   async get(key,fallback=null) {
    return store.has(key)?structuredClone(store.get(key)):structuredClone(fallback);
   },
   async set(key,value) {
    store.set(key,structuredClone(value));return true;
   },
   async list(prefix) {
    return [...store.keys()].filter(key=>key.startsWith(prefix));
   },
  },
 };
}
test('founder badge registry persists and does not duplicate after a simulated restart',async()=>{
 const store=new Map(),one=mockClient(store);
 const founders=await registerFoundingServers(one);
 assert.equal(founders.length,2);
 assert.equal(founders[0].number,1);
 const second=mockClient(store);
 assert.deepEqual(await registerFoundingServers(second),founders);
 assert.deepEqual(await getFoundingBadge(second,founders[0].guildId),founders[0]);
 assert.equal((await second.db.get('beacon:founders:v1')).entries.length,2);
});
test('daily reroll changes one quest once and survives a simulated restart',async()=>{
 const store=new Map(),guildId='111111111111111111';
 const first=mockClient(store);
 const snapshot=await getServerProgression(first,guildId);
 const id=snapshot.dailyQuests[0].id;
 const changed=await rerollDailyQuest(first,guildId,id);
 assert.equal(changed.result.changed,true);
 assert.equal(changed.data.dailyQuests.length,snapshot.dailyQuests.length);
 assert.notEqual(changed.data.dailyQuests[0].id,id);
 const restart=mockClient(store);
 assert.equal((await rerollDailyQuest(restart,guildId,changed.data.dailyQuests[0].id)).result.changed,false);
 assert.equal((await getServerProgression(restart,guildId)).dailyQuests[0].id,changed.data.dailyQuests[0].id);
});
test('weekly archival never destroys lifetime XP or lifetime contribution counts',async()=>{
 const store=new Map(),client=mockClient(store),guildId='111111111111111111';
 const original=await mutateServerProgression(client,guildId,data=>{
  data.xp=1050;
  data.contributors.lifetime['555555555555555555']={messages:5,commands:3};
  data.weekly.week='2020-01-06';
  data.weekly.quests[0].progress=3;
  return {changed:true};
 });
 assert.equal(original.data.xp,1050);
 const rolled=await mutateServerProgression(client,guildId,data=>({changed:true}));
 assert.equal(rolled.data.weekly.week,utcWeekKey());
 assert.equal(rolled.data.weeklyHistory.length,1);
 assert.equal(rolled.data.weeklyHistory[0].week,'2020-01-06');
 assert.equal(rolled.data.xp,1050);
 assert.equal(contributorRanking(rolled.data,'lifetime')[0].actions,8);
});
test('rank card returns a real PNG with fixed 1000 by 520 dimensions',()=>{
 const png=renderProgressionRankPng({name:'The Sand Castle',rank:1,level:21,xp:11400,progress:64,founder:{number:1}});
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(png.toString('ascii',12,16),'IHDR');
 assert.equal(png.readUInt32BE(16),1000);
 assert.equal(png.readUInt32BE(20),520);
 assert.ok(png.length>1000);
});

test('contributor opt-out hides public ranking but retains saved lifetime totals',async()=>{
 const store=new Map(),guildId='111111111111111111',userId='555555555555555555';
 const first=mockClient(store);
 await mutateServerProgression(first,guildId,data=>{
  data.contributors.lifetime[userId]={messages:12,commands:4};
  data.contributionOptOut=[userId];
  return {changed:true};
 });
 const second=mockClient(store);
 const loaded=await getServerProgression(second,guildId);
 assert.equal(loaded.contributors.lifetime[userId].messages,12);
 assert.equal(loaded.contributionOptOut.includes(userId),true);
 assert.deepEqual(contributorRanking(loaded,'lifetime'),[]);
});
