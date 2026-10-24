import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerProgression, rerollDailyQuest, mutateServerProgression,
  registerFoundingServers, getFoundingBadge, contributorRanking, utcWeekKey,
  getGlobalProgressionLeaderboard,
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

test('daily quest rollover archives results instead of deleting them',async()=>{
 const store=new Map(),guildId='111111111111111111',client=mockClient(store);
 await mutateServerProgression(client,guildId,data=>{
   data.lastQuestDay='2026-01-01';
   data.dailyQuests=[{id:'spark',title:'✨ First Sparks',progress:3,target:3,
      completed:true,reward:35}];
   return {changed:true};
 });
 const loaded=await getServerProgression(mockClient(store),guildId);
 assert.equal(loaded.dailyQuestHistory.length,1);
 assert.equal(loaded.dailyQuestHistory[0].day,'2026-01-01');
 assert.equal(loaded.dailyQuestHistory[0].quests[0].completed,true);
 await mutateServerProgression(mockClient(store),guildId,()=>({changed:true}));
 const again=await getServerProgression(mockClient(store),guildId);
 assert.equal(again.dailyQuestHistory.length,1);
 assert.notEqual(again.lastQuestDay,'2026-01-01');
});

test('reading the progression panel saves initial daily/weekly quests immediately',async()=>{
 const guildId='111111111111111111',store=new Map(),client=mockClient(store);
 const preview=await getServerProgression(client,guildId);
 const persisted=store.get('guild:'+guildId+':progression');
 assert.ok(persisted,'first view must persist daily and weekly quests');
 assert.equal(persisted.lastQuestDay,preview.lastQuestDay);
 assert.equal(persisted.weekly.week,utcWeekKey());
 assert.deepEqual(persisted.dailyQuests,preview.dailyQuests);
 assert.equal((await getServerProgression(mockClient(store),guildId)).dailyQuests.length,preview.dailyQuests.length);
});
test('a view after UTC rollover archives daily/weekly quest history in storage',async()=>{
 const guildId='111111111111111111',store=new Map(),client=mockClient(store);
 await mutateServerProgression(client,guildId,data=>{
  data.lastQuestDay='2026-01-01';
  data.dailyQuests=[{id:'spark',title:'First Sparks',progress:1,target:3,completed:false,reward:35}];
  data.weekly.week='2026-01-05';
  data.weekly.quests[0].progress=4;
  return {changed:true};
 });
 const preview=await getServerProgression(mockClient(store),guildId);
 const saved=store.get('guild:'+guildId+':progression');
 assert.equal(saved.lastQuestDay,preview.lastQuestDay);
 assert.ok(saved.dailyQuestHistory.some(q=>q.day==='2026-01-01' && q.quests[0].progress===1));
 assert.ok(saved.weeklyHistory.some(w=>w.week==='2026-01-05'));
});
test('a storage write that returns false is not reported as success',async()=>{
 const client=mockClient();
 client.db.set=async()=>false;
 await assert.rejects(()=>mutateServerProgression(client,'111111111111111111',()=>({changed:true})),/storage rejected the write/);
 await assert.rejects(()=>registerFoundingServers(client),/storage rejected the write/);
});
test('PostgreSQL advisory locks reserve connection headroom in a small pool',async()=>{
 const client=mockClient(new Map(),['111111111111111111','222222222222222222','333333333333333333']);
 let active=0,peak=0;
 client.db.db={
  isAvailable:()=>true,
  pool:{
   options:{max:2},
   connect:async()=>{
    active++;peak=Math.max(peak,active);
    return {query:async()=>({rows:[]}),release:()=>{active--;}};
   },
  },
 };
 await Promise.all(['111111111111111111','222222222222222222','333333333333333333']
   .map(id=>getServerProgression(client,id)));
 assert.equal(peak,1,'only one long-lived lock connection in a pool of two');
 assert.equal(active,0);
});
test('a single-connection PostgreSQL pool fails fast rather than hanging forever',async()=>{
 const client=mockClient();
 client.db.db={isAvailable:()=>true,pool:{options:{max:1},connect:async()=>{throw Error('should not connect');}}};
 await assert.rejects(()=>getServerProgression(client,'111111111111111111'),/at least two PostgreSQL connections/);
});

test('global rankings are deterministic on tied XP and never show excluded servers',async()=>{
 const a='111111111111111111',b='222222222222222222',c='333333333333333333';
 const store=new Map(),client=mockClient(store,[a,b,c]);
 for(const [id,excluded] of [[a,false],[b,false],[c,true]]){
  await mutateServerProgression(client,id,data=>{
   data.xp=5000;data.leaderboardExcluded=excluded;return {changed:true};
  });
 }
 const board=await getGlobalProgressionLeaderboard(mockClient(store,[a,b,c]));
 assert.deepEqual(board.map(x=>x.guildId),[a,b]);
 assert.deepEqual(board.map(x=>x.xp),[5000,5000]);
});
test('large leaderboard requests have bounded concurrent database reads',async()=>{
 const ids=Array.from({length:31},(_,i)=>String(BigInt('111111111111111111')+BigInt(i)));
 const store=new Map(),client=mockClient(store,ids);
 for(const id of ids)store.set('guild:'+id+':progression',{xp:10,level:1});
 let current=0,peak=0;
 const original=client.db.get;
 client.db.get=async(key,def)=>{
  current++;peak=Math.max(peak,current);
  await Promise.resolve();
  const value=await original(key,def);
  current--;
  return value;
 };
 const board=await getGlobalProgressionLeaderboard(client);
 assert.equal(board.length,ids.length);
 assert.ok(peak>1&&peak<=8,'parallel reads must be bounded to a batch of eight');
});
