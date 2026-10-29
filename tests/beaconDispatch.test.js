import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import {
 DISPATCH_LIMITS,DISPATCH_MISSIONS,dispatchStorageKey,dispatchLevel,dispatchNextLevelXp,
 dispatchReward,dispatchBaseReward,getDispatchStatus,startDispatch,answerDispatch,
 abandonDispatch,createDispatchAssignment,chooseDispatchCareer,resignDispatchCareer,
} from '../src/services/beaconDispatchService.js';
import { buildDispatchBoard,buildDispatchCareerPicker,buildDispatchResignation,buildDispatchMission,buildDispatchResult } from '../src/utils/beaconDispatchUi.js';
import { handleBeaconDispatch } from '../src/interactions/buttons/sandDispatch.js';
import dispatchButton from '../src/interactions/buttons/sandDispatch.js';
import { handleSandWalletButton } from '../src/interactions/buttons/sandEconomyActions.js';
import sandCoinsCommand from '../src/commands/Community/sandcoins.js';
import { sandWalletStorageKey } from '../src/services/sandCoinsService.js';

const uid='111111111111111111',other='222222222222222222';
const startTime=new Date('2026-10-28T08:00:00Z');
function mockDb(){
 const values=new Map();
 // Existing contractor simulation: a career was chosen previously.
 values.set(dispatchStorageKey(uid),{careerId:'courier'});
 const pool={async connect(){return {
  async query(sql,args=[]){
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(sql.startsWith('SELECT value FROM'))
    return {rows:values.has(args[0])?[{value:structuredClone(values.get(args[0]))}]:[]};
   if(sql.startsWith('INSERT INTO')){values.set(args[0],JSON.parse(args[1]));return {rows:[]};}
   throw Error('Unexpected SQL: '+sql);
  },
  release(){},
 };}};
 const client={db:{db:{pool,isAvailable:()=>true},get:async(key,def=null)=>structuredClone(values.get(key)??def)}};
 return {client,values};
}
const rng=max=>max-1;
const at=(date,minutes=0)=>new Date(date.getTime()+minutes*60000);
async function finish(client,userId,session,now,answers='correct'){
 let done;
 const token=session.active.token;
 for(let step=0;step<session.active.stages.length;step++){
  const q=session.active.stages[step];
  const choice=answers==='correct'?q.correct:(q.correct+1)%3;
  done=await answerDispatch(client,{userId,token,step,choice,now:at(now,step)});
 }
 return done;
}
test('Dispatch is a single existing /sandcoins subcommand, with no new top-level command or leaderboard',()=>{
 const names=sandCoinsCommand.data.toJSON().options.map(x=>x.name);
 assert.equal(names.filter(x=>x==='dispatch').length,1);
 assert.equal(dispatchButton.length,1);
 assert.equal(dispatchButton[0].name,'sand_dispatch');
 assert.equal(names.includes('dispatchleaderboard'),false);
 assert.equal(DISPATCH_MISSIONS.length,5);
});
test('contractor levels unlock different divisions and have capped scaling',()=>{
 assert.equal(dispatchLevel(0),1);
 assert.equal(dispatchLevel(2),2);
 assert.equal(dispatchLevel(6),3);
 assert.equal(dispatchLevel(30),6);
 assert.equal(dispatchLevel(90),10);
 assert.equal(dispatchLevel(999999),15);
 assert.equal(dispatchNextLevelXp(1),2);
 const easyL1=createDispatchAssignment({level:1,difficulty:'easy',careerId:'courier',rng});
 const hardL1=createDispatchAssignment({level:1,difficulty:'hard',careerId:'courier',rng});
 assert.equal(easyL1.missionId,'courier');
 assert.equal(hardL1.stages.length,4);
 assert.equal(easyL1.stages.length,3);
 for(const career of DISPATCH_MISSIONS){
  for(const level of [1,5,10]){
   const mission=createDispatchAssignment({level,difficulty:'hard',careerId:career.id,rng});
   assert.equal(mission.missionId,career.id);
   for(const stage of mission.stages){
    assert.equal(stage.options.length,3);
    assert.equal(stage.options[stage.correct].length>0,true);
    assert.ok(stage.explanation.length>0);
   }
  }
 }
 assert.ok(dispatchBaseReward(15)>dispatchBaseReward(1));
 assert.ok(dispatchBaseReward(15)<50);
});
test('Hard pays exactly twice the Easy reward for equivalent accuracy at a given level',()=>{
 for(const level of [1,4,7,10,15]){
  assert.equal(dispatchReward(level,'hard',4,4),2*dispatchReward(level,'easy',3,3));
  assert.equal(dispatchReward(level,'hard',3,4)>0,true);
  assert.equal(dispatchReward(level,'hard',2,4),0);
  assert.equal(dispatchReward(level,'easy',1,3),0);
 }
 assert.throws(()=>dispatchReward(1,'hard',5,4),/INVALID_DISPATCH_SCORE/);
});
test('Dispatch board is private-ready, offers both difficulties, and never exposes answer keys',async()=>{
 const {client}=mockDb();
 const profile=await getDispatchStatus(client,uid,startTime);
 const board=buildDispatchBoard(profile,startTime);
 const buttons=board.components.flatMap(r=>r.toJSON().components);
 assert.ok(buttons.some(b=>b.custom_id==='sand_dispatch:start:easy'));
 assert.ok(buttons.some(b=>b.custom_id==='sand_dispatch:start:hard'));
 assert.match(board.embeds[0].toJSON().description,/2×/);
 const started=await startDispatch(client,{userId:uid,difficulty:'hard',now:startTime,rng});
 assert.equal(started.status,'STARTED');
 const payload=buildDispatchMission(started.profile,uid);
 assert.equal(payload.components.length,4);
 const content=JSON.stringify({embeds:payload.embeds.map(x=>x.toJSON()),components:payload.components.map(x=>x.toJSON())});
 assert.ok(!content.includes('"correct"'));
 assert.ok(!content.includes('"explanation"'));
 assert.ok(payload.components.flatMap(x=>x.toJSON().components)
  .some(b=>b.custom_id.startsWith('sand_dispatch:pick:'+uid+':')));
});
test('completion pays once, credits global wallet and progresses levels',async()=>{
 const {client,values}=mockDb();
 const first=await startDispatch(client,{userId:uid,difficulty:'hard',now:startTime,rng});
 const active=first.profile.active,correctChoice=active.stages[0].correct;
 const firstAnswer=await answerDispatch(client,{userId:uid,token:active.token,step:0,choice:correctChoice,now:at(startTime,1)});
 assert.equal(firstAnswer.status,'NEXT');
 const replay=await answerDispatch(client,{userId:uid,token:active.token,step:0,choice:correctChoice,now:at(startTime,2)});
 assert.equal(replay.status,'STALE');
 let response=firstAnswer;
 for(let step=1;step<active.stages.length;step++)
  response=await answerDispatch(client,{userId:uid,token:active.token,step,
   choice:active.stages[step].correct,now:at(startTime,step+1)});
 assert.equal(response.status,'COMPLETE');
 assert.equal(response.result.coins,2*dispatchBaseReward(1));
 assert.equal(response.profile.level,2);
 assert.equal(response.result.xpGain,2);
 assert.equal(values.get(sandWalletStorageKey(uid)).balance,response.result.coins);
 assert.equal(values.get(sandWalletStorageKey(uid)).history.length,1);
 const repeated=await answerDispatch(client,{userId:uid,token:active.token,step:3,
  choice:active.stages[3].correct,now:at(startTime,6)});
 assert.equal(repeated.status,'STALE');
 assert.equal(values.get(sandWalletStorageKey(uid)).history.length,1);
 assert.equal(values.get(sandWalletStorageKey(uid)).balance,response.result.coins);
 const screen=buildDispatchResult(response.profile,response.result);
 assert.match(screen.embeds[0].toJSON().description,/LEVEL UP/);
});
test('wrong answers fail qualification and pay zero even on Hard',async()=>{
 const {client,values}=mockDb();
 const started=await startDispatch(client,{userId:uid,difficulty:'hard',now:startTime,rng});
 const done=await finish(client,uid,started.profile,at(startTime,1),'wrong');
 assert.equal(done.status,'COMPLETE');
 assert.equal(done.result.coins,0);
 assert.equal(done.result.xpGain,0);
 assert.equal(done.profile.completed,0);
 assert.equal(values.has(sandWalletStorageKey(uid)),false);
});
test('daily attempt, start cooldown and expiry are GLOBAL and cannot be bypassed by switching servers',async()=>{
 const {client}=mockDb();
 let now=startTime;
 const first=await startDispatch(client,{userId:uid,difficulty:'easy',now,rng});
 const second=await startDispatch(client,{userId:uid,difficulty:'hard',now:at(now,1),rng});
 assert.equal(second.status,'BLOCKED');
 assert.equal(second.reason,'ACTIVE');
 const expired=await getDispatchStatus(client,uid,at(now,13));
 assert.equal(expired.active,null);
 const cooldown=await startDispatch(client,{userId:uid,difficulty:'easy',now:at(now,13),rng});
 assert.equal(cooldown.reason,'COOLDOWN');
 now=at(now,21);
 const next=await startDispatch(client,{userId:uid,difficulty:'easy',now,rng});
 assert.equal(next.status,'STARTED');
 const cancelled=await abandonDispatch(client,{userId:uid,token:next.profile.active.token,now:at(now,1)});
 assert.equal(cancelled.status,'ABANDONED');
 now=at(now,21);
 const third=await startDispatch(client,{userId:uid,difficulty:'easy',now,rng});
 assert.equal(third.status,'STARTED');
 await abandonDispatch(client,{userId:uid,token:third.profile.active.token,now:at(now,1)});
 const limited=await startDispatch(client,{userId:uid,difficulty:'easy',now:at(now,21),rng});
 assert.equal(limited.reason,'DAILY_ATTEMPTS');
 assert.equal(limited.profile.startsToday,3);
 const reset=await startDispatch(client,{userId:uid,difficulty:'easy',now:new Date('2026-10-29T08:00:00Z'),rng});
 assert.equal(reset.status,'STARTED');
});
test('global daily and weekly minting caps cannot be flooded with Hard perfect runs',async()=>{
 const {client,values}=mockDb();
 let aggregate=0;
 for(let day=28;day<=31;day++){
  for(let attempt=0;attempt<3;attempt++){
   const now=new Date('2026-10-'+day+'T08:'+String(attempt*21).padStart(2,'0')+':00Z');
   const start=await startDispatch(client,{userId:uid,difficulty:'hard',now,rng});
   if(start.status==='BLOCKED'){
    // The daily cap may be exhausted after just two high-level Hard jobs.
    // Hitting a cap must prevent any additional assignment starts.
    assert.ok(['WEEKLY_CAP','DAILY_CAP','DAILY_ATTEMPTS'].includes(start.reason),start.reason);
    continue;
   }
   assert.equal(start.status,'STARTED');
   const done=await finish(client,uid,start.profile,at(now,1));
   assert.equal(done.status,'COMPLETE');
   assert.ok(done.result.coins<=DISPATCH_LIMITS.dailyCoins);
   aggregate+=done.result.coins;
   const profile=await getDispatchStatus(client,uid,at(now,6));
   assert.ok(profile.earnedToday<=DISPATCH_LIMITS.dailyCoins);
   assert.ok(profile.earnedWeek<=DISPATCH_LIMITS.weeklyCoins);
  }
 }
 assert.equal(aggregate,DISPATCH_LIMITS.weeklyCoins);
 assert.equal(values.get(sandWalletStorageKey(uid)).balance,aggregate);
 assert.equal(values.get(sandWalletStorageKey(uid)).lifetime,aggregate);
 assert.ok(values.get(sandWalletStorageKey(uid)).history.every(e=>e.kind==='dispatch'));
});
test('tampered owner, stage or session token never pays and a foreign user cannot use buttons',async()=>{
 const {client,values}=mockDb();
 const started=await startDispatch(client,{userId:uid,difficulty:'easy',now:startTime,rng});
 const session=started.profile.active;
 const invalid=await answerDispatch(client,{userId:uid,token:'ffffffffffff',step:0,
  choice:session.stages[0].correct,now:at(startTime,1)});
 assert.equal(invalid.status,'STALE');
 const invalidStep=await answerDispatch(client,{userId:uid,token:session.token,step:2,
  choice:session.stages[0].correct,now:at(startTime,2)});
 assert.equal(invalidStep.status,'STALE');
 let foreignResponse;
 await handleBeaconDispatch({guildId:'333333333333333333',user:{id:other},
  async reply(payload){foreignResponse=payload;}},client,['pick',uid,session.token,'0','0']);
 assert.match(foreignResponse?.content||'',/belongs to another user/);
 assert.equal(foreignResponse.flags,MessageFlags.Ephemeral);
 assert.equal(values.has(sandWalletStorageKey(uid)),false);
});

test('existing Wallet Dispatch button opens the contractor board, not the wallet again',async()=>{
 const {client}=mockDb();
 let result,acknowledged=false;
 await handleSandWalletButton({
  guildId:'333333333333333333',
  user:{id:uid},
  async deferUpdate(){acknowledged=true;},
  async editReply(payload){result=payload;},
 },client,['dispatch']);
 assert.equal(acknowledged,true);
 assert.match(result.embeds[0].toJSON().title,/Beacon Dispatch/);
 assert.ok(result.components.flatMap(r=>r.toJSON().components)
  .some(button=>button.custom_id==='sand_dispatch:start:hard'));
});


test('Easy and Hard situations stay readable, with no old jargon or confusing ID puzzles',()=>{
 const banned=/\b(?:MHz|latency|undervoltage|frequency|manifest seal|transposed digits|relay code|baud|KX-714|ND-04)\b/i;
 for(const level of [1,3,6,10,15]){
  for(const difficulty of ['easy','hard']){
   for(let seed=0;seed<30;seed++){
    let tick=0;
    const assignment=createDispatchAssignment({level,difficulty,careerId:DISPATCH_MISSIONS[seed%5].id,rng:max=>{
     // Exercise different unlocked divisions, question offsets and answer orders.
     return (seed+tick++)%max;
    }});
    const size=difficulty==='hard'?4:3;
    assert.equal(assignment.stages.length,size);
    for(const s of assignment.stages){
     assert.ok(s.question.length>20 && s.question.length<=250);
     assert.ok(s.clues.length>0 && s.clues.length<=5);
     assert.equal(s.options.length,3);
     assert.equal(new Set(s.options).size,3);
     assert.ok(s.options.every(x=>x.length<=75));
     assert.ok(!banned.test([s.question,...s.clues,...s.options,s.explanation].join(' ')));
     assert.ok(s.explanation.length>=30);
    }
   }
  }
 }
});
test('mission screens explain pass requirements plainly and show final explanation',async()=>{
 const {client}=mockDb();
 const easy=await startDispatch(client,{userId:uid,difficulty:'easy',now:startTime,rng});
 const easyScreen=buildDispatchMission(easy.profile,uid);
 assert.match(JSON.stringify(easyScreen.embeds[0].toJSON()),/2 of 3 correct/);
 const hard=await getDispatchStatus(client,uid,startTime);
 const board=buildDispatchBoard(hard,startTime);
 assert.match(JSON.stringify(board.embeds[0].toJSON()),/get at least 3 right/);
 const r=buildDispatchResult({...hard,level:2},{missionName:'Courier Routing',missionEmoji:'📦',
  difficulty:'hard',correct:4,total:4,rawReward:48,coins:48,xpGain:2,priorLevel:1,newLevel:2,passed:true},
  {correct:true,explanation:'The hospital medicine is urgent.'});
 assert.match(r.embeds[0].toJSON().description,/hospital medicine is urgent/);
});


test('new users choose one of five permanent careers before their first assignment',async()=>{
 const {client,values}=mockDb();
 values.delete(dispatchStorageKey(uid));
 const profile=await getDispatchStatus(client,uid,startTime);
 assert.equal(profile.careerId,null);
 assert.equal(profile.canStart,false);
 assert.equal(profile.reason,'NO_CAREER');
 const picker=buildDispatchBoard(profile,startTime);
 const buttons=picker.components.flatMap(r=>r.toJSON().components);
 assert.equal(buttons.filter(b=>b.custom_id.startsWith('sand_dispatch:career:')).length,5);
 assert.ok(!buttons.some(b=>b.custom_id.startsWith('sand_dispatch:start:')));
 for(const id of ['emergency','bus','courier','relay','systems'])
  assert.ok(buttons.some(b=>b.custom_id==='sand_dispatch:career:'+id));
 const blocked=await startDispatch(client,{userId:uid,difficulty:'easy',now:startTime,rng});
 assert.equal(blocked.status,'BLOCKED');
 assert.equal(blocked.reason,'NO_CAREER');
 assert.equal(values.has(sandWalletStorageKey(uid)),false);
});

test('career selection persists and no accidental job switching is allowed',async()=>{
 const {client,values}=mockDb();
 values.delete(dispatchStorageKey(uid));
 const hired=await chooseDispatchCareer(client,{userId:uid,careerId:'emergency',now:startTime});
 assert.equal(hired.status,'HIRED');
 assert.equal(hired.profile.careerId,'emergency');
 assert.equal(values.get(dispatchStorageKey(uid)).careerId,'emergency');
 const again=await chooseDispatchCareer(client,{userId:uid,careerId:'bus',now:startTime});
 assert.equal(again.status,'EMPLOYED');
 assert.equal((await getDispatchStatus(client,uid,startTime)).careerId,'emergency');
 assert.equal((await chooseDispatchCareer(client,{userId:uid,careerId:'fake',now:startTime})).status,'UNKNOWN_CAREER');
 const started=await startDispatch(client,{userId:uid,difficulty:'hard',now:startTime,rng});
 assert.equal(started.profile.active.missionId,'emergency');
 const whileActive=await resignDispatchCareer(client,{userId:uid,now:at(startTime,1)});
 assert.equal(whileActive.status,'ACTIVE');
 await abandonDispatch(client,{userId:uid,token:started.profile.active.token,now:at(startTime,1)});
 const resignation=await resignDispatchCareer(client,{userId:uid,now:at(startTime,2)});
 assert.equal(resignation.status,'RESIGNED');
 assert.equal(resignation.profile.careerId,null);
 assert.equal(resignation.profile.startsToday,1);
 assert.equal(resignation.profile.cooldownUntil,startTime.getTime()+DISPATCH_LIMITS.cooldownMs);
 const hiredBus=await chooseDispatchCareer(client,{userId:uid,careerId:'bus',now:at(startTime,2)});
 assert.equal(hiredBus.status,'HIRED');
 assert.equal(hiredBus.profile.careerId,'bus');
 assert.equal(hiredBus.profile.startsToday,1);
 const blocked=await startDispatch(client,{userId:uid,difficulty:'easy',now:at(startTime,3),rng});
 assert.equal(blocked.reason,'COOLDOWN');
 const later=await startDispatch(client,{userId:uid,difficulty:'easy',now:at(startTime,21),rng});
 assert.equal(later.status,'STARTED');
 assert.equal(later.profile.active.missionId,'bus');
 assert.equal(values.has(sandWalletStorageKey(uid)),false);
});

test('resigning after earning coins never erases a balance, XP or career history',async()=>{
 const {client,values}=mockDb();
 await resignDispatchCareer(client,{userId:uid,now:startTime});
 await chooseDispatchCareer(client,{userId:uid,careerId:'emergency',now:startTime});
 const started=await startDispatch(client,{userId:uid,difficulty:'hard',now:startTime,rng});
 const done=await finish(client,uid,started.profile,at(startTime,1));
 const earned=done.result.coins;
 const experience=done.profile.xp;
 const after=await resignDispatchCareer(client,{userId:uid,now:at(startTime,7)});
 assert.equal(after.status,'RESIGNED');
 assert.equal(after.profile.xp,experience);
 assert.equal(after.profile.earnedToday,earned);
 assert.equal(after.profile.earnedWeek,earned);
 assert.equal(after.profile.startsToday,1);
 assert.equal(values.get(sandWalletStorageKey(uid)).balance,earned);
 const newCareer=await chooseDispatchCareer(client,{userId:uid,careerId:'bus',now:at(startTime,7)});
 assert.equal(newCareer.profile.xp,experience);
 assert.equal(newCareer.profile.completed,1);
 assert.equal(newCareer.profile.earnedToday,earned);
});

test('emergency Easy requires a single service; Hard coordinates multiple services',async()=>{
 for(let seed=0;seed<8;seed++){
  let ix=0;
  const rng=max=>(seed+ix++)%max;
  for(const stage of createDispatchAssignment({level:10,difficulty:'easy',careerId:'emergency',rng}).stages){
   assert.ok(['Police','Ambulance','Fire crew'].includes(stage.options[stage.correct]));
   assert.ok(stage.options.every(x=>!x.includes('+')));
  }
  ix=0;
  for(const stage of createDispatchAssignment({level:10,difficulty:'hard',careerId:'emergency',rng}).stages){
   assert.match(stage.options[stage.correct],/\+/);
   assert.match(stage.explanation,/police|ambulance|fire|urgent|medical|traffic/i);
  }
 }
 const multi=[...Array(8)].flatMap((_,k)=>{
  let call=0;return createDispatchAssignment({level:10,difficulty:'hard',careerId:'emergency',
   rng:max=>(k+call++)%max}).stages.map(x=>x.options[x.correct]);
 });
 assert.ok(multi.some(x=>x.includes('Police + Ambulance + Fire crew')));
 assert.ok(multi.some(x=>x.includes('Fire crew + Ambulance')));
});

test('bus career offers real bus situations and career level unlocks new situations',()=>{
 const topics=[];
 for(const level of [1,5,10]){
  const observed=new Set();
  for(let seed=0;seed<8;seed++){
   let i=0;
   const mission=createDispatchAssignment({level,difficulty:'hard',careerId:'bus',
    rng:max=>(seed+i++)%max});
   assert.equal(mission.missionId,'bus');
   for(const stage of mission.stages)observed.add(stage.question);
  }
  topics.push(observed);
 }
 assert.ok([...topics[0]].every(x=>topics[1].has(x)));
 assert.ok([...topics[1]].every(x=>topics[2].has(x)));
 assert.ok(topics[0].size<topics[1].size && topics[1].size<topics[2].size);
 assert.ok([...topics[2]].some(x=>/bus|routes|driver|departures/i.test(x)));
});

test('Discord career buttons lead to hiring and resignation confirmation',async()=>{
 const {client,values}=mockDb();
 values.delete(dispatchStorageKey(uid));
 let payload;
 const mock={
  guildId:'333333333333333333',user:{id:uid},
  async deferUpdate(){},
  async editReply(p){payload=p;return p;},
 };
 await handleBeaconDispatch(mock,client,['career','emergency']);
 assert.match(payload.embeds[0].toJSON().title,/Emergency Response/);
 assert.equal(values.get(dispatchStorageKey(uid)).careerId,'emergency');
 await handleBeaconDispatch(mock,client,['resign']);
 assert.match(payload.embeds[0].toJSON().title,/Leave Your Dispatch Job/);
 await handleBeaconDispatch(mock,client,['board']);
 assert.equal(values.get(dispatchStorageKey(uid)).careerId,'emergency');
 await handleBeaconDispatch(mock,client,['confirm-resign']);
 assert.match(payload.embeds[0].toJSON().title,/Choose Your Career/);
 assert.equal(values.get(dispatchStorageKey(uid)).careerId,null);
});
