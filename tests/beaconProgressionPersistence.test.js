import test from 'node:test';
import assert from 'node:assert/strict';
import { getServerProgression, rerollDailyQuest, mutateServerProgression,
  registerFoundingServers, getFoundingBadge, contributorRanking, utcWeekKey,
  getWeeklyCatalog, WEEKLY_BALANCE_VERSION,
  getGlobalProgressionLeaderboard, withGuildLock,
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

test('leaderboard exclusion recycles the exact Founder number to the next oldest eligible server',async()=>{
 const ids=Array.from({length:27},(_,i)=>String(BigInt('111111111111111111')+BigInt(i)));
 const store=new Map();
 const client=mockClient(store,ids);
 const initial=await registerFoundingServers(client);
 assert.equal(initial.length,25);
 assert.deepEqual(initial.map(e=>e.number),Array.from({length:25},(_,i)=>i+1));
 const removed=initial[2],oldestWaiting=ids[25];
 assert.equal(removed.guildId,ids[2]);
 const xpBefore=8123;
 store.set('guild:'+removed.guildId+':progression',{xp:xpBefore,leaderboardExcluded:true});
 const changed=await registerFoundingServers(client);
 assert.equal(changed.length,25);
 assert.equal(changed.filter(x=>x.number===removed.number).length,1);
 assert.equal(changed.find(x=>x.number===removed.number).guildId,oldestWaiting);
 assert.equal(changed.some(x=>x.guildId===removed.guildId),false);
 assert.equal(await getFoundingBadge(client,removed.guildId),null);
 assert.equal((await getFoundingBadge(client,oldestWaiting)).number,removed.number);
 assert.equal(store.get('guild:'+removed.guildId+':progression').xp,xpBefore);
 // Restart and repeated re-registration cannot duplicate a badge or promote
 // a banned server again, even with a spare Founder number.
 const restarted=mockClient(store,ids);
 const again=await registerFoundingServers(restarted);
 assert.deepEqual(again,changed);
 assert.equal(new Set(again.map(x=>x.number)).size,25);
 assert.equal(new Set(again.map(x=>x.guildId)).size,25);
});

test('previously excluded test servers lose Founder badge and empty slots remain available',async()=>{
 const ids=Array.from({length:3},(_,i)=>String(BigInt('222222222222222222')+BigInt(i)));
 const store=new Map(),client=mockClient(store,ids);
 const assigned=await registerFoundingServers(client);
 assert.equal(assigned.length,3);
 store.set('guild:'+ids[0]+':progression',{xp:1999,leaderboardExcluded:true});
 const reassigned=await registerFoundingServers(client);
 assert.equal(reassigned.some(x=>x.guildId===ids[0]),false);
 assert.deepEqual(reassigned.map(x=>x.number),[2,3]);
 // Its Founder badge is hidden immediately after the exclusion flag is saved,
 // even before the registry reallocation pass.
 assert.equal(await getFoundingBadge(client,ids[0]),null);
 const again=await registerFoundingServers(mockClient(store,ids));
 assert.deepEqual(again,reassigned);
});

test('Founder registry refuses to claim reassignment if persistent save failed',async()=>{
 const ids=['111111111111111111','222222222222222222','333333333333333333'];
 const store=new Map(),client=mockClient(store,ids);
 await registerFoundingServers(client);
 store.set('guild:'+ids[0]+':progression',{xp:0,leaderboardExcluded:true});
 const original=structuredClone(store.get('beacon:founders:v1'));
 client.db.set=async()=>false;
 await assert.rejects(()=>registerFoundingServers(client),/Founding registry storage rejected the write/);
 assert.deepEqual(store.get('beacon:founders:v1'),original);
 assert.equal(await getFoundingBadge(client,ids[0]),null);
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
test('weekly challenge rebalance is difficult enough to avoid instant #1 from three easy quests',()=>{
 const list=getWeeklyCatalog(),byId=new Map(list.map(x=>[x.id,x]));
 assert.equal(WEEKLY_BALANCE_VERSION,3);
 assert.equal(list.length,6);
 assert.equal(new Set(list.map(x=>x.id)).size,6);
 const maxThree=list.map(q=>q.reward).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0);
 assert.ok(maxThree<=920,'a full weekly set should not eclipse daily activity rewards');
 assert.deepEqual(
  ['warmup','explorer','streak','team','dailies','legend'].map(id=>byId.get(id).target),
  [100,50,5,8,15,3000],
 );
 assert.ok(list.every(q=>q.reward>=100&&q.reward<=300));
 assert.equal(byId.get('team').minMembers,8,'unattainable multi-user quests cannot be assigned to small servers');
});

test('existing unfinished weekly quests rebalance on read while keeping old XP and earned completions',async()=>{
 const guildId='111111111111111111',store=new Map();
 const key='guild:'+guildId+':progression';
 const week=utcWeekKey(),today=new Date().toISOString().slice(0,10);
 store.set(key,{
  xp:2300,level:3,lastQuestDay:today,dailyQuests:[{id:'spark',title:'First Sparks',
   target:3,progress:0,completed:false,reward:35}],
  weekly:{week,days:[today],uniqueMembers:['111111111111111111'],quests:[
   {id:'warmup',title:'🌱 Weekly Warmup',description:'Old',metric:'messages',
    target:20,progress:20,completed:true,reward:250,minMembers:1},
   {id:'explorer',title:'🤖 Beacon Explorer',description:'Old',metric:'commands',
    target:10,progress:9,completed:false,reward:300,minMembers:1},
   {id:'streak',title:'📅 Consistent Crew',description:'Old',metric:'activeDays',
    target:3,progress:2,completed:false,reward:500,minMembers:1},
  ]},
 });
 const client=mockClient(store);
 const first=await getServerProgression(client,guildId);
 assert.equal(first.xp,2300,'do not retroactively take earned XP');
 assert.equal(first.weekly.balanceVersion,WEEKLY_BALANCE_VERSION);
 const [finished,commands,streak]=first.weekly.quests;
 assert.equal(finished.completed,true);
 assert.equal(finished.target,20);
 assert.equal(finished.reward,250,'completed rewards must reflect what was paid');
 assert.equal(commands.completed,false);
 assert.equal(commands.progress,9,'retain legitimate quest progress');
 assert.equal(commands.target,50);
 assert.equal(commands.reward,180);
 assert.equal(streak.progress,2);
 assert.equal(streak.target,5);
 assert.equal(streak.reward,200);
 assert.equal(store.get(key).weekly.balanceVersion,WEEKLY_BALANCE_VERSION,
  'new policy must survive a bot restart even if nobody earns more XP');
 const restart=mockClient(store);
 const again=await getServerProgression(restart,guildId);
 assert.deepEqual(again.weekly.quests,first.weekly.quests);
 assert.equal(again.xp,2300);
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
  store.set('guild:'+id+':config',{serverProgression:{enabled:true}});
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
 for(const id of ids){
  store.set('guild:'+id+':config',{serverProgression:{enabled:true}});
  store.set('guild:'+id+':progression',{xp:10,level:1});
 }
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

test('PostgreSQL lock slot handoff never exceeds the configured reserve under a burst',async()=>{
 const client=mockClient();
 let active=0,peak=0;
 client.db.db={
  isAvailable:()=>true,
  pool:{
   options:{max:4},
   connect:async()=>{
    active++;peak=Math.max(active,peak);
    await Promise.resolve();
    return {query:async()=>({rows:[]}),release:()=>{active--;}};
   },
  },
 };
 await Promise.all(Array.from({length:25},(_,i)=>
  withGuildLock('burst-'+i,async()=>{await Promise.resolve();},client)));
 assert.ok(peak<=2,'max four total connections should allow at most two advisory holders');
 assert.equal(active,0);
});
