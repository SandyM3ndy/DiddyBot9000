/**
 * Beacon Dispatch Network: global, opt-in mini assignments.
 * Every start and answer is transactional in PostgreSQL. Difficulty selection,
 * answer keys, budget limits and progression are verified ONLY on the server.
 * No leaderboard, no guild-scoped loopholes, no new top-level slash commands.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { atomicSandTransaction, sandWalletStorageKey } from './sandCoinsService.js';

const PREFIX='beacon:dispatch:v1:user:';
export const DISPATCH_LIMITS=Object.freeze({
 dailyCoins:100,weeklyCoins:350,attemptsPerDay:3,
 cooldownMs:20*60*1000,sessionMs:12*60*1000,maxLevel:15,
});
export const DISPATCH_MISSIONS=Object.freeze([
 {id:'courier',name:'Courier Routing',emoji:'📦',unlock:1},
 {id:'relay',name:'Signal Recovery',emoji:'📡',unlock:3},
 {id:'systems',name:'System Stabilisation',emoji:'⚡',unlock:6},
 {id:'audit',name:'Manifest Audit',emoji:'📋',unlock:10},
]);
export const dispatchStorageKey=userId=>PREFIX+userId;
const validUser=id=>typeof id==='string'&&/^\d{17,20}$/.test(id);
const isoDay=date=>date.toISOString().slice(0,10);
const isoWeek=date=>{
 const monday=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 return isoDay(monday);
};
export const dispatchNextLevelXp=level=>level*(level+1);
export function dispatchLevel(xp){
 const safe=Number.isSafeInteger(xp)&&xp>=0?xp:0;
 let level=1;
 while(level<DISPATCH_LIMITS.maxLevel&&safe>=dispatchNextLevelXp(level))level++;
 return level;
}
export const dispatchBaseReward=level=>24+3*Math.floor((Math.max(1,Math.min(15,level))-1)/3);
export function dispatchReward(level,difficulty,correct,total){
 if(!['easy','hard'].includes(difficulty)||!Number.isInteger(correct)||!Number.isInteger(total)||total<1||correct<0||correct>total)
  throw new Error('INVALID_DISPATCH_SCORE');
 const needed=difficulty==='hard'?Math.ceil(total*0.75):Math.ceil(total*0.60);
 if(correct<needed)return 0;
 const base=Math.floor(dispatchBaseReward(level)*correct/total);
 return base*(difficulty==='hard'?2:1);
}
const empty=()=>({
 xp:0,day:'',week:'',earnedToday:0,earnedWeek:0,startsToday:0,
 cooldownUntil:0,active:null,completed:0,lastResult:null,
});
function normalise(raw,now){
 if(raw!==null&&raw!==undefined&&(!raw||typeof raw!=='object'||Array.isArray(raw)))
  throw new Error('Dispatch progress malformed; no data overwritten');
 const d={...empty(),...(raw||{})};
 for(const field of ['xp','earnedToday','earnedWeek','startsToday','cooldownUntil','completed']){
  if(!Number.isSafeInteger(d[field])||d[field]<0)throw new Error('Invalid Dispatch progress: '+field);
 }
 if(d.day!==isoDay(now)){d.day=isoDay(now);d.earnedToday=0;d.startsToday=0;}
 if(d.week!==isoWeek(now)){d.week=isoWeek(now);d.earnedWeek=0;}
 if(d.active!==null&&(!d.active||typeof d.active!=='object'||!Array.isArray(d.active.stages)||
   !/^[a-f0-9]{12}$/.test(d.active.token)||!['easy','hard'].includes(d.active.difficulty)||
   !Number.isInteger(d.active.stage)||d.active.stage<0||d.active.stage>=d.active.stages.length))
  throw new Error('Invalid active Dispatch session; no data overwritten');
 return d;
}
function statusOf(state,now){
 const p=normalise(state,now);
 const active=p.active&&p.active.expiresAt>now.getTime()?p.active:null;
 const level=dispatchLevel(p.xp);
 const reason=active?'ACTIVE':p.startsToday>=DISPATCH_LIMITS.attemptsPerDay?'DAILY_ATTEMPTS':
  p.earnedToday>=DISPATCH_LIMITS.dailyCoins?'DAILY_CAP':
  p.earnedWeek>=DISPATCH_LIMITS.weeklyCoins?'WEEKLY_CAP':
  p.cooldownUntil>now.getTime()?'COOLDOWN':null;
 return {...p,active,level,canStart:!reason,reason,remainingToday:Math.max(0,DISPATCH_LIMITS.dailyCoins-p.earnedToday),
  remainingWeek:Math.max(0,DISPATCH_LIMITS.weeklyCoins-p.earnedWeek)};
}
export async function getDispatchStatus(client,userId,now=new Date()){
 if(!validUser(userId))throw new Error('Invalid contractor');
 return statusOf(await client.db.get(dispatchStorageKey(userId),null),now);
}
const job=(question,clues,correct,wrongA,wrongB,explanation)=>({
 question,clues,correct,wrong:[wrongA,wrongB],explanation,
});
const catalog={
 courier:{
  easy:[
   job('Where does shipment BX-72 belong?',['Official destination code: ND-04','The printed parcel sticker says SD-04 (flagged as incorrect).'],
    'Northern Depot (ND-04)','Southern Depot (SD-04)','Central Depot (CD-02)','Follow the verified manifest, not the flagged package sticker.'),
   job('Which route can deliver a standard communications crate?',['Route A is closed for repairs.','Route B is open to standard freight.','Route C requires a hazardous-cargo permit.'],
    'Route B — Ridge Connector','Route A — Expressway','Route C — Quay Access','The Ridge Connector is the only open, unrestricted route.'),
   job('Which seal should the receiving officer accept?',['Official manifest: seal KX-714','Driver note: KX-741 (unverified transcription).'],
    'KX-714','KX-741','BX-72','The seal on the official manifest is authoritative.'),
   job('What should be recorded when the crate is delivered?',['Status: arrived and verified','Recipient signature: confirmed'],
    'Verified delivery','Return to sender','Shipment lost','The consignment has been received and verified.'),
  ],
  hard:[
   job('Which depot satisfies BOTH region and manifest code?',['Region: Northern','Authorised code: ND-04','Parcel sticker: ND-40 (transposed digits).'],
    'Northern Depot ND-04','Northern Depot ND-40','Northern Depot ND-14','The verified code is ND-04; similar-looking codes are not interchangeable.'),
   job('Choose a route for a 3.1 m truck with no restricted-access permit.',['Route A: open, height limit 2.8 m','Route B: open, height limit 3.8 m','Route C: no height limit, special permit required'],
    'Route B — Ridge Connector','Route A — Expressway','Route C — Quay Access','Route B clears the truck height and has no permit restriction.'),
   job('Validate the seal while resolving a transposed-digit discrepancy.',['Manifest seal KX-714','Driver copy KX-741','Scan barcode shows shipment BX-72 (not a seal).'],
    'KX-714','KX-741','BX-72','The signed manifest is the authoritative seal reference.'),
   job('Which handover record is internally consistent?',['Verified depot ND-04','Accepted seal KX-714','Container BX-72'],
    'ND-04 / KX-714 / BX-72','ND-40 / KX-714 / BX-72','ND-04 / KX-741 / BX-72','Every field must match the verified records.'),
  ],
 },
 relay:{
  easy:[
   job('Which relay frequency is authorised?',['Radio plan: 142.80 MHz','Monitor shows interference at 142.08 MHz.'],
    '142.80 MHz','142.08 MHz','148.20 MHz','The signed radio plan specifies 142.80 MHz.'),
   job('Which transmitter should receive the reboot request?',['Relay North: disconnected','Relay South: online','Relay Central: online'],
    'Relay North','Relay South','Relay Central','Only Relay North is reporting an outage.'),
   job('Which link status confirms recovery?',['Target: stable synchronisation','Warning lights are red when a link is out of sync.'],
    'Synchronised / green','Unsynchronised / red','Disconnected / grey','A stable synchronised link indicates recovery.'),
   job('Where should the recovery record be filed?',['Division: Communications','Maintenance order: RC-27'],
    'Communications / RC-27','Transport / RC-27','Communications / RC-72','Use the correct division and the exact work order.'),
  ],
  hard:[
   job('Which channel matches the approved frequency AND relay identity?',['North relay: 142.80 MHz','South relay: 142.08 MHz','Failed link: NORTH'],
    'North / 142.80 MHz','North / 142.08 MHz','South / 142.80 MHz','The relay and authorised frequency must both match.'),
   job('Which backup path meets latency and availability limits?',['Required latency: 60 ms or less','Path A: 42 ms, offline','Path B: 56 ms, online','Path C: 71 ms, online'],
    'Path B','Path A','Path C','Only Path B is online and below the latency ceiling.'),
   job('Which time window matches the restoration log?',['Outage started 14:20 UTC','Link restored 14:37 UTC','One console incorrectly displays 14:73.'],
    '17 minutes','53 minutes','37 minutes','14:37 minus 14:20 equals 17 minutes.'),
   job('Pick the verified end-state for closing the outage.',['North: online','Latency: 56 ms','Target: latency at most 60 ms and link online'],
    'Online / 56 ms / resolved','Online / 71 ms / resolved','Offline / 56 ms / resolved','Both link availability and latency must satisfy the acceptance criteria.'),
  ],
 },
 systems:{
  easy:[
   job('Which unit needs attention?',['Unit A: operational','Unit B: fault light red','Unit C: operational'],
    'Unit B','Unit A','Unit C','The red fault light identifies Unit B.'),
   job('What should be enabled before planned maintenance?',['Primary power must be isolated during repair.','Backup power is healthy.'],
    'Verified backup power','Leave all power disconnected','Disable safety monitoring','Verified backup supply prevents an avoidable outage.'),
   job('What status means the console is stable?',['Status codes: GREEN normal; AMBER warning; RED critical'],
    'GREEN','RED','AMBER','GREEN is the documented normal state.'),
   job('Where should the incident be logged?',['Facility: Beacon Systems Hub','Incident number: BS-18'],
    'Systems Hub / BS-18','Systems Hub / BS-81','Transport Hub / BS-18','Record the correct facility and incident number.'),
  ],
  hard:[
   job('Which subsystem is at fault, given both error and voltage?',['Rack A: 12.0 V, status normal','Rack B: 10.4 V, undervoltage fault','Rack C: 12.1 V, status normal'],
    'Rack B / undervoltage','Rack A / undervoltage','Rack C / undervoltage','Rack B alone has the low-voltage fault.'),
   job('Select the approved maintenance sequence.',['Rule: verify backup BEFORE isolating primary','Rule: only reset AFTER primary is isolated'],
    'Verify backup → isolate primary → reset','Isolate primary → verify backup → reset','Reset → isolate primary → verify backup','The order matters: backup validation must happen before isolation.'),
   job('Which cooling unit meets every requirement?',['Limit: 30 °C maximum','Fan A: 27 °C, fan offline','Fan B: 29 °C, fan online','Fan C: 34 °C, fan online'],
    'Fan B','Fan A','Fan C','Fan B is online and below the temperature limit.'),
   job('Choose the final closeout measurement.',['Target supply 11.5–12.5 V','Target status GREEN','Unit B is now GREEN at 12.1 V'],
    'GREEN / 12.1 V','AMBER / 12.1 V','GREEN / 10.4 V','Status and measured voltage must both be acceptable.'),
  ],
 },
 audit:{
  easy:[
   job('How many relay modules are on the invoice?',['4 crates','12 modules per crate'],
    '48 modules','36 modules','52 modules','4 multiplied by 12 is 48.'),
   job('Which tracking ID is official?',['Order book: BA-094','Loose sticker: BA-049'],
    'BA-094','BA-049','BA-904','Use the identifier in the authorised order book.'),
   job('Which crate should be flagged?',['Crate 1 sealed','Crate 2 missing seal','Crate 3 sealed'],
    'Crate 2','Crate 1','Crate 3','Crate 2 has the missing security seal.'),
   job('What is the correct audit outcome?',['All quantities match after recount.','Crate 2 seal remains unresolved.'],
    'Hold with seal exception','Accept without note','Delete the manifest','An unresolved seal exception must be recorded.'),
  ],
  hard:[
   job('Calculate the total confirmed inventory.',['5 crates listed at 12 units each','One crate is missing exactly 3 units','All others are complete'],
    '57 units','60 units','45 units','Five times twelve minus three equals 57.'),
   job('Which discrepancy has both an ID AND quantity error?',['Approved: BA-094 / 57 units','Record A: BA-094 / 60 units','Record B: BA-049 / 60 units','Record C: BA-049 / 57 units'],
    'Record B','Record A','Record C','Record B disagrees with both identifier and confirmed quantity.'),
   job('Select the accurate variance and reporting action.',['Invoice: 60 units','Verified: 57 units','Variance must be recorded, not silently corrected.'],
    '3 missing / create discrepancy report','3 extra / close without report','No variance / close order','Three units are missing and need a traceable report.'),
   job('Pick the only compliant final audit record.',['Correct ID: BA-094','Verified count: 57','Unresolved variance: 3 missing'],
    'BA-094 / 57 / open variance','BA-049 / 57 / cleared','BA-094 / 60 / cleared','Do not erase the unresolved variance or alter the confirmed count.'),
  ],
 },
};
const shuffle=(values,rng)=>{
 const a=[...values];
 for(let i=a.length-1;i>0;i--){const j=rng(i+1);[a[i],a[j]]=[a[j],a[i]];}
 return a;
};
export function createDispatchAssignment({level,difficulty,rng=randomInt}){
 if(!['easy','hard'].includes(difficulty))throw new Error('INVALID_DIFFICULTY');
 const unlocked=DISPATCH_MISSIONS.filter(x=>level>=x.unlock);
 if(!unlocked.length)throw new Error('NO_DISPATCH_MISSIONS');
 const mission=unlocked[rng(unlocked.length)];
 const templates=catalog[mission.id][difficulty];
 const offset=rng(templates.length);
 const size=difficulty==='hard'?4:3;
 const stages=Array.from({length:size},(_,i)=>{
  const t=templates[(offset+i)%templates.length];
  const options=shuffle([t.correct,...t.wrong],rng);
  return {question:t.question,clues:t.clues,options,correct:options.indexOf(t.correct),explanation:t.explanation};
 });
 return {missionId:mission.id,missionName:mission.name,missionEmoji:mission.emoji,stages};
}
export async function startDispatch(client,{userId,difficulty,now=new Date(),rng=randomInt}){
 if(!validUser(userId))throw new Error('Invalid contractor');
 if(!['easy','hard'].includes(difficulty))return {status:'INVALID_DIFFICULTY'};
 const key=dispatchStorageKey(userId);
 const token=randomBytes(6).toString('hex');
 return atomicSandTransaction(client,[key],async tx=>{
  const state=normalise(tx.get(key),now),view=statusOf(state,now);
  if(view.reason)return {status:'BLOCKED',reason:view.reason,profile:view};
  const assignment=createDispatchAssignment({level:view.level,difficulty,rng});
  state.startsToday++;
  state.cooldownUntil=now.getTime()+DISPATCH_LIMITS.cooldownMs;
  state.active={token,difficulty,level:view.level,stage:0,correct:0,startedAt:now.getTime(),
   expiresAt:now.getTime()+DISPATCH_LIMITS.sessionMs,...assignment};
  tx.put(key,state);
  return {status:'STARTED',profile:statusOf(state,now)};
 });
}
export async function abandonDispatch(client,{userId,token,now=new Date()}){
 if(!validUser(userId))throw new Error('Invalid contractor');
 const key=dispatchStorageKey(userId);
 return atomicSandTransaction(client,[key],async tx=>{
  const state=normalise(tx.get(key),now);
  if(!state.active||state.active.token!==token||state.active.expiresAt<=now.getTime())
   return {status:'STALE',profile:statusOf(state,now)};
  state.active=null;
  tx.put(key,state);
  return {status:'ABANDONED',profile:statusOf(state,now)};
 });
}
export async function answerDispatch(client,{userId,token,step,choice,now=new Date()}){
 if(!validUser(userId))throw new Error('Invalid contractor');
 const key=dispatchStorageKey(userId),wk=sandWalletStorageKey(userId);
 return atomicSandTransaction(client,[key,wk],async tx=>{
  const state=normalise(tx.get(key),now),active=state.active;
  if(!active||active.token!==token||active.expiresAt<=now.getTime()||
     active.stage!==step||!Number.isInteger(choice)||choice<0||choice>2)
   return {status:'STALE',profile:statusOf(state,now)};
  const question=active.stages[step],correct=question.correct===choice;
  if(correct)active.correct++;
  active.stage++;
  const feedback={correct,explanation:question.explanation};
  if(active.stage<active.stages.length){
   tx.put(key,state);
   return {status:'NEXT',profile:statusOf(state,now),feedback};
  }
  const rawReward=dispatchReward(active.level,active.difficulty,active.correct,active.stages.length);
  const available=Math.max(0,Math.min(DISPATCH_LIMITS.dailyCoins-state.earnedToday,
   DISPATCH_LIMITS.weeklyCoins-state.earnedWeek));
  const coins=Math.min(rawReward,available);
  if(coins>0){
   const raw=tx.get(wk);
   if(raw!==null&&(!raw||typeof raw!=='object'||Array.isArray(raw)))
    throw new Error('Malformed wallet: refusing Dispatch payout');
   const wallet={balance:0,lifetime:0,history:[],...(raw||{})};
   if(!Number.isSafeInteger(wallet.balance)||wallet.balance<0||
      !Number.isSafeInteger(wallet.lifetime)||wallet.lifetime<0||
      !Number.isSafeInteger(wallet.balance+coins)||!Number.isSafeInteger(wallet.lifetime+coins))
    throw new Error('Invalid wallet: refusing Dispatch payout');
   wallet.balance+=coins;
   wallet.lifetime+=coins;
   wallet.history=[{kind:'dispatch',delta:coins,difficulty:active.difficulty,
    missionId:active.missionId,at:now.toISOString()},...(Array.isArray(wallet.history)?wallet.history:[])].slice(0,30);
   tx.put(wk,wallet);
   state.earnedToday+=coins;state.earnedWeek+=coins;
  }
  const priorLevel=dispatchLevel(state.xp);
  const passed=rawReward>0;
  // XP is not awarded for incorrect runs or for completed work beyond limits.
  const xpGain=passed&&available>0?(active.difficulty==='hard'?2:1):0;
  state.xp+=xpGain;
  if(!Number.isSafeInteger(state.xp))throw new Error('Dispatch XP overflow');
  state.completed+=passed?1:0;
  const result={missionName:active.missionName,missionEmoji:active.missionEmoji,
   difficulty:active.difficulty,correct:active.correct,total:active.stages.length,
   rawReward,coins,xpGain,priorLevel,newLevel:dispatchLevel(state.xp),
   at:now.getTime(),passed};
  state.lastResult=result;
  state.active=null;
  tx.put(key,state);
  return {status:'COMPLETE',profile:statusOf(state,now),feedback,result};
 });
}
