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
// All jobs use ordinary language. Easy is an obvious practical choice;
// Hard presents competing priorities, limited resources or multiple constraints.
// Changing templates never changes existing active assignments (snapshotted in DB).
const catalog={
 courier:{
  easy:[
   job('A package must reach the hospital. Which road should the driver use?',
    ['The main road is closed.','The side road is open and reaches the hospital.'],
    'Take the open side road','Drive through the closed road','Drive away from the hospital',
    'The side road is open and reaches the correct destination.'),
   job('Which package should go on the school delivery van?',
    ['The van is heading to the school.','The packages are labelled school, hospital and bakery.'],
    'The school package','The hospital package','The bakery package',
    'Send the package that matches the delivery destination.'),
   job('The customer is not home. What should the driver do?',
    ['The delivery requires a signature.','No one is available to sign.'],
    'Mark it for a safe redelivery','Leave it outside without a signature','Mark it as delivered anyway',
    'A signed delivery should not be left unattended or falsely marked complete.'),
   job('You have reached the right house. What should happen next?',
    ['The customer has answered the door.','The parcel matches their address.'],
    'Hand the parcel to the customer','Leave with the parcel without telling them','Take it to another address',
    'The right recipient is available, so complete the delivery.'),
   job('A parcel is visibly damaged before delivery. What is the best move?',
    ['The box is torn and its contents may be damaged.'],
    'Report the damage to Dispatch','Hide the damage and deliver it','Throw away the parcel',
    'Report visible damage so the shipment can be checked properly.'),
   job('The delivery address was entered incorrectly. What should you do?',
    ['The dispatch office has the updated correct address.'],
    'Follow the confirmed updated address','Guess the destination','Deliver to the old address anyway',
    'Use the address confirmed by Dispatch rather than guessing.'),
  ],
  hard:[
   job('Three deliveries are waiting. Which should you deliver first?',
    ['A hospital needs urgent medicine now.','A school closes in 30 minutes.','A warehouse accepts parcels all day.'],
    'Deliver the hospital medicine first','Visit the all-day warehouse first','Deliver only to the school',
    'Urgent medical supplies take priority; the warehouse can wait.'),
   job('Choose a safe route for a tall delivery truck.',
    ['The truck is too tall for the town tunnel.','The bridge road is open and accepts trucks.','The shortest street is blocked.'],
    'Use the open bridge road','Use the low tunnel','Enter the blocked street',
    'The bridge is the only route that is both open and suitable for the truck.'),
   job('You have one hour and two parcels. Which plan meets both deadlines?',
    ['The clinic closes in 20 minutes and is 10 minutes away.','The library closes in an hour and is 15 minutes beyond the clinic.'],
    'Clinic first, then library','Library first, then clinic','Wait 30 minutes, then visit both',
    'The clinic needs the earlier delivery; the library can still be reached afterward.'),
   job('One delivery truck breaks down. Which package gets the spare van?',
    ['The spare van carries one package.','A bakery order is due tomorrow.','A hospital is waiting for emergency equipment.'],
    'Give the spare van to the hospital package','Use it for the bakery order','Keep the spare van empty',
    'The urgent hospital delivery needs the remaining transport capacity.'),
   job('The usual route has flooded. Which plan keeps the delivery safe?',
    ['The flooded road is closed.','A longer approved bypass is open.','An unmarked shortcut crosses the floodwater.'],
    'Take the approved bypass','Try the flooded shortcut','Enter the closed road',
    'A safe approved bypass is better than attempting floodwater.'),
   job('Two deliveries have different requirements. Which loading plan works?',
    ['Medicine must stay cool.','Books must remain dry.','The van has a cooler and a covered cargo shelf.'],
    'Medicine in the cooler; books on the covered shelf','Books in the cooler; medicine in the sun','Leave both packages uncovered',
    'Each package should travel in conditions suitable for it.'),
  ],
 },
 relay:{
  easy:[
   job('A radio station has stopped responding. What should you check first?',
    ['The station screen says its power is off.'],
    'Check the station power','Turn off every working station','Delete all messages',
    'Start with the reported power problem.'),
   job('Which station needs help?',
    ['North station: offline.','South station: working.','East station: working.'],
    'North station','South station','East station',
    'North is the only station reporting a problem.'),
   job('An emergency message arrives. What should the operator do?',
    ['The message requests urgent assistance.'],
    'Forward it to the response team','Ignore it','Save it without alerting anyone',
    'Urgent messages should reach the team that can respond.'),
   job('The damaged connection is repaired. What confirms it is working?',
    ['The screen now says Connected.','Messages are arriving normally.'],
    'Confirm the repair is complete','Declare every station broken','Disconnect the repaired link',
    'A connected link receiving messages is working normally.'),
   job('A station warns that a battery is almost empty. What is sensible?',
    ['An approved backup battery is available.'],
    'Switch to the approved backup','Ignore the warning indefinitely','Disconnect every other station',
    'Use the available backup to keep the service operating.'),
   job('Which message should be sent to a technician?',
    ['The station has lost connection and needs repair.'],
    'Station offline; please check connection','Station online; no action needed','All deliveries complete',
    'The technician needs an accurate description of the problem.'),
  ],
  hard:[
   job('Two stations need help. Which should be restored first?',
    ['Station A handles urgent hospital calls and is offline.','Station B plays music and is offline.','Only one repair team is available.'],
    'Restore Station A for hospital calls','Restore the music station first','Leave both offline',
    'Emergency communications take priority over entertainment.'),
   job('How can both stations stay connected during a repair?',
    ['The main connection has failed.','A tested backup connection is available.','The faulty cable must be replaced.'],
    'Activate backup, then repair the faulty cable','Disconnect backup and begin repairs','Continue using only the failed connection',
    'Switch to the tested backup before interrupting the failed connection.'),
   job('Which report correctly identifies the remaining problem?',
    ['North station is working again.','South station still cannot send messages.','East station is working.'],
    'North and East working; South needs repair','All stations are broken','South is fixed; North needs repair',
    'Report which stations are working and which one still needs attention.'),
   job('A storm is approaching. Which plan protects vital communications?',
    ['The outdoor relay is vulnerable to the storm.','The protected backup relay can carry emergency calls.'],
    'Move emergency calls to the protected backup','Rely only on the exposed relay','Switch off both relays',
    'A protected, functioning backup is safer during the storm.'),
   job('One technician can fix either of two problems. What comes first?',
    ['A clinic cannot receive urgent calls.','A dashboard colour is displaying incorrectly.','The dashboard still works.'],
    'Restore the clinic connection first','Fix the dashboard colour first','Shut down both services',
    'The broken urgent-call connection has the greater immediate impact.'),
   job('Which closing report is accurate?',
    ['The original connection has been repaired.','Test messages are reaching both stations.','The backup is still available.'],
    'Service restored and tested; backup ready','Everything is still offline','Backup missing; repair untested',
    'The report should match the completed repair and successful test.'),
  ],
 },
 systems:{
  easy:[
   job('A warning light appears on one machine. What do you inspect?',
    ['Machine A: green and working.','Machine B: red warning light.'],
    'Machine B','Machine A','Neither machine',
    'The warning is coming from Machine B.'),
   job('A computer says it needs a restart to finish an update. What should you do?',
    ['The maintenance window has started.','All work has been safely saved.'],
    'Restart during the maintenance window','Unplug every server immediately','Ignore the update forever',
    'Restarting as planned lets the update finish safely.'),
   job('One room is overheating. What should you check?',
    ['The room is hot.','The cooling fan has stopped.'],
    'The stopped cooling fan','The reception desk','The delivery van',
    'The stopped fan is the likely cause of the heat.'),
   job('The backup generator is working. What should the status say?',
    ['The backup generator is running normally.'],
    'Backup power active','All power lost','Generator missing',
    'Report the actual working status.'),
   job('An alarm stops after a repair. What is the correct next action?',
    ['The technician says the repair is complete.','The system can be tested.'],
    'Test the repaired system','Assume it works without checking','Switch off the monitoring screen',
    'A test verifies that the repair actually worked.'),
   job('A broken monitor has been replaced. What should be recorded?',
    ['The new monitor is working.'],
    'Replaced and tested','Lost and unrecovered','Still broken',
    'The work record should match the successful replacement.'),
  ],
  hard:[
   job('Power fails in two rooms. Which room gets the single backup first?',
    ['Room A runs critical emergency communications.','Room B shows optional advertising screens.','Only one backup supply is ready.'],
    'Power Room A first','Power the advertising screens first','Leave the backup disconnected',
    'Critical communications need backup power before optional displays.'),
   job('A repair may interrupt service. Which order is safest?',
    ['A working backup system is available.','The main system needs repair.','Service must stay online.'],
    'Start backup, switch service, then repair main','Repair main before activating backup','Shut down both systems',
    'Keep service running on the backup while repairing the main system.'),
   job('Which cooling plan meets the safety rules?',
    ['Room A is too hot and its fan is broken.','A spare fan is available.','Room B is already cool.'],
    'Install the spare fan in Room A','Move the fan to Room B','Turn off temperature alerts',
    'Use the spare fan where cooling has actually failed.'),
   job('Two alerts appear. Which needs attention first?',
    ['Alarm A: emergency call system offline.','Alarm B: nonessential display is flickering.','One technician is available.'],
    'Fix the emergency call system first','Polish the display first','Close both alerts without checking',
    'A service outage affecting emergency calls outweighs a cosmetic display issue.'),
   job('A server overheats after a fan stops. What is the best response?',
    ['A healthy backup server is available.','The hot server needs to cool before repair.'],
    'Switch to backup, then inspect the hot server','Ignore the temperature warning','Restart the overheating server repeatedly',
    'Protect the service with a backup and address the unsafe temperature.'),
   job('What should the final repair report say?',
    ['The backup ran during maintenance.','The main system was repaired and tested.','Service is operating normally again.'],
    'Main restored and tested; backup ready','Repair untested; service still down','Backup destroyed; main not repaired',
    'A good report states what was fixed, verified, and left ready.'),
  ],
 },
 audit:{
  easy:[
   job('Five boxes contain four items each. How many items are there?',
    ['5 boxes','4 items in every box'],
    '20 items','9 items','25 items',
    'Five groups of four make twenty.'),
   job('One box is missing its delivery label. What should you do?',
    ['The other boxes have readable labels.'],
    'Flag the unlabelled box','Guess where it belongs','Throw away the whole order',
    'An unlabelled box needs checking before delivery.'),
   job('The order says six chairs and six have arrived. What is the result?',
    ['Order: 6 chairs','Delivered: 6 chairs'],
    'Order complete','Four chairs missing','Two extra chairs arrived',
    'The expected and delivered amounts match.'),
   job('Which package should be reported?',
    ['Box A is sealed.','Box B is open and missing an item.'],
    'Box B','Box A','Neither box',
    'An open box with a missing item needs a report.'),
   job('A receipt has the wrong date. What is the best action?',
    ['The correct date is shown on the confirmed delivery record.'],
    'Correct the receipt using the verified date','Invent a new date','Delete the receipt',
    'Use the verified record to correct the mistake.'),
   job('All items are counted. What should happen next?',
    ['The count matches the order exactly.'],
    'Record the correct count and close the check','Report missing items that are not missing','Hide the count',
    'A matching count can be accurately recorded as complete.'),
  ],
  hard:[
   job('A store ordered twelve batteries. What should you report?',
    ['Two boxes were meant to contain six batteries each.','One box contains six; the other has four.'],
    '10 received; 2 missing','12 received; none missing','8 received; 4 missing',
    'Six plus four is ten, so two batteries are missing.'),
   job('Which order needs the most urgent follow-up?',
    ['The hospital is missing medical supplies it needs today.','The office is missing pens needed next week.','There is one available investigator.'],
    'Check the hospital supplies first','Check the office pens first','Ignore both orders',
    'The hospital shortage has the urgent deadline and greater consequence.'),
   job('You find a damaged delivery. Which report is complete and accurate?',
    ['Eight monitors were ordered.','Seven work; one arrived broken.'],
    '8 received; 1 damaged; follow-up needed','7 received; everything fine','8 working; no damage',
    'All eight arrived, but one is damaged and needs follow-up.'),
   job('Two suppliers can replace a broken part. Which can meet the deadline?',
    ['The repair needs the part by Friday.','Supplier A can deliver Monday.','Supplier B can deliver Thursday.'],
    'Order from Supplier B','Order from Supplier A','Wait until next week',
    'Thursday arrives before the Friday deadline.'),
   job('A delivery count does not match the invoice. What should be done?',
    ['The invoice says 20 items.','Only 18 have arrived.','The missing two have not been located.'],
    'Record 18 received and report 2 missing','Sign off all 20 as received','Throw away the invoice',
    'Keep the actual count and record the missing items.'),
   job('A shipment has two issues. Which note tells the full story?',
    ['Ten chairs were ordered.','Nine arrived.','One of those nine is damaged.'],
    '9 arrived; 1 missing; 1 damaged','10 arrived; nothing wrong','8 arrived; 2 missing; none damaged',
    'Nine arrived, one is missing, and another needs damage follow-up.'),
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
