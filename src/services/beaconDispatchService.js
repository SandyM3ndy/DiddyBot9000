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
// A career is permanent until the contractor explicitly resigns. All five
// are available from level 1; higher levels unlock more complex assignments
// WITHIN that career rather than forcing an unrelated random job.
export const DISPATCH_MISSIONS=Object.freeze([
 {id:'emergency',name:'Emergency Response Dispatcher',emoji:'🚨',description:'Decide which police, ambulance and fire crews should respond to fictional emergency calls.'},
 {id:'bus',name:'Bus Operations Dispatcher',emoji:'🚌',description:'Keep drivers, stops and buses running safely and on time.'},
 {id:'courier',name:'Courier Logistics Officer',emoji:'📦',description:'Route deliveries, manage urgent packages and solve transport problems.'},
 {id:'relay',name:'Communications Operator',emoji:'📡',description:'Keep communication stations connected when problems appear.'},
 {id:'systems',name:'Facility Operations Controller',emoji:'⚡',description:'Handle building faults, repairs, backup systems and maintenance.'},
]);
export const dispatchCareer=careerId=>DISPATCH_MISSIONS.find(x=>x.id===careerId)||null;
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
 xp:0,careerId:null,day:'',week:'',earnedToday:0,earnedWeek:0,startsToday:0,
 cooldownUntil:0,active:null,completed:0,lastResult:null,
});
function normalise(raw,now){
 if(raw!==null&&raw!==undefined&&(!raw||typeof raw!=='object'||Array.isArray(raw)))
  throw new Error('Dispatch progress malformed; no data overwritten');
 const d={...empty(),...(raw||{})};
 if(d.careerId!==null&&!dispatchCareer(d.careerId))
  throw new Error('Unknown saved Dispatch career; refusing to overwrite');
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
  p.cooldownUntil>now.getTime()?'COOLDOWN':!dispatchCareer(p.careerId)?'NO_CAREER':null;
 return {...p,active,level,canStart:!reason,reason,remainingToday:Math.max(0,DISPATCH_LIMITS.dailyCoins-p.earnedToday),
  remainingWeek:Math.max(0,DISPATCH_LIMITS.weeklyCoins-p.earnedWeek)};
}
export async function getDispatchStatus(client,userId,now=new Date()){
 if(!validUser(userId))throw new Error('Invalid contractor');
 return statusOf(await client.db.get(dispatchStorageKey(userId),null),now);
}
export async function chooseDispatchCareer(client,{userId,careerId,now=new Date()}){
 if(!validUser(userId))throw new Error('Invalid contractor');
 if(!dispatchCareer(careerId))return {status:'UNKNOWN_CAREER'};
 const key=dispatchStorageKey(userId);
 return atomicSandTransaction(client,[key],async tx=>{
  const state=normalise(tx.get(key),now);
  if(state.careerId)return {status:'EMPLOYED',profile:statusOf(state,now)};
  if(state.active?.expiresAt>now.getTime())
   return {status:'ACTIVE',profile:statusOf(state,now)};
  state.careerId=careerId;
  tx.put(key,state);
  return {status:'HIRED',profile:statusOf(state,now)};
 });
}
export async function resignDispatchCareer(client,{userId,now=new Date()}){
 if(!validUser(userId))throw new Error('Invalid contractor');
 const key=dispatchStorageKey(userId);
 return atomicSandTransaction(client,[key],async tx=>{
  const state=normalise(tx.get(key),now);
  if(state.active?.expiresAt>now.getTime())
   return {status:'ACTIVE',profile:statusOf(state,now)};
  if(!state.careerId)return {status:'NO_CAREER',profile:statusOf(state,now)};
  state.careerId=null;
  // Keep XP, completion history, earning windows and cooldowns unchanged.
  tx.put(key,state);
  return {status:'RESIGNED',profile:statusOf(state,now)};
 });
}
const job=(question,clues,correct,wrongA,wrongB,explanation)=>({
 question,clues,correct,wrong:[wrongA,wrongB],explanation,
});
// All jobs use ordinary language. Easy is an obvious practical choice;
// Hard presents competing priorities, limited resources or multiple constraints.
// Changing templates never changes existing active assignments (snapshotted in DB).
const catalog={
 emergency:{
  easy:[
   job('A person reports a break-in. Which single service should you send?',
    ['Someone is trying to enter a locked home.','Nobody is reported injured or trapped.'],
    'Police','Ambulance','Fire crew','A break-in is primarily a police response.'),
   job('A caller says someone has collapsed and needs medical help. Who responds?',
    ['The caller reports a serious medical problem.','There is no fire or threat reported.'],
    'Ambulance','Police','Fire crew','Send an ambulance for the medical emergency.'),
   job('A rubbish bin is on fire outside a shop. Which service is needed?',
    ['Flames are visible.','Nobody is reported injured.'],
    'Fire crew','Bus driver','Police','Fire crews handle the reported fire.'),
   job('A cyclist has fallen and is badly hurt. Who do you send?',
    ['The cyclist is injured and needs urgent medical attention.','No other danger is reported.'],
    'Ambulance','Fire crew','Police','The priority is getting medical help to the cyclist.'),
   job('A caller reports a stolen car but nobody is injured. Who responds?',
    ['The car was stolen from a car park.','There is no fire or medical emergency.'],
    'Police','Ambulance','Fire crew','Theft is handled by police.'),
   job('Smoke is coming from an empty garage. Who should be dispatched?',
    ['The caller sees thick smoke coming out.','No people are reported inside.'],
    'Fire crew','Ambulance','Bus driver','Fire crews should investigate the reported smoke.'),
   job('Someone is threatening people at a shop. Which service should respond?',
    ['The caller reports threats.','No injuries or fire have been reported.'],
    'Police','Ambulance','Fire crew','Police are the primary service for the reported threats.'),
   job('A person is having trouble breathing. Which service should you dispatch?',
    ['The caller says the person needs immediate medical help.','No other hazard is reported.'],
    'Ambulance','Police','Fire crew','The call describes a medical emergency requiring an ambulance.'),
  ],
  hard:[
   job('A road crash left a driver injured and traffic is becoming dangerous. Who responds?',
    ['A driver is seriously injured.','Traffic needs to be kept away from the crash.','Nobody is trapped and no fire is reported.'],
    'Police + Ambulance','Police only','Fire crew only','The injured driver needs an ambulance, while police manage the road danger.'),
   job('A house is burning and someone inside has been injured. What do you send?',
    ['Flames are spreading through the house.','One person needs medical attention.','No violence is reported.'],
    'Fire crew + Ambulance','Police only','Ambulance only','Fire crews handle the fire while ambulance crews help the injured person.'),
   job('A serious crash has trapped an injured passenger and blocked a highway. Choose the response.',
    ['Someone is trapped inside a damaged car.','The passenger is injured.','Traffic is piling up around the scene.'],
    'Police + Ambulance + Fire crew','Police + Ambulance only','Fire crew only',
    'Fire crews are needed for the trapped person, ambulance for injuries and police for traffic.'),
   job('An injured person is being threatened by an aggressive stranger. What is needed?',
    ['The person needs medical attention.','The stranger is still threatening people.','There is no fire or trapped person.'],
    'Police + Ambulance','Ambulance only','Fire crew only','Police deal with the threat while ambulance staff help the injured person.'),
   job('A shop is on fire and a customer is trapped inside. Choose the best response.',
    ['There is an active fire and a person cannot escape.','The caller says the trapped person may be hurt.','The street is crowded.'],
    'Police + Ambulance + Fire crew','Police only','Ambulance only',
    'Fire crew tackles the fire and rescue, ambulance supports casualties, and police help secure the street.'),
   job('A truck has crashed into a building and its driver is injured. Who should respond?',
    ['The damaged building may be unsafe.','The driver is hurt.','Traffic is blocked by the truck.'],
    'Police + Ambulance + Fire crew','Police only','Ambulance only',
    'This scene needs traffic control, medical care and fire-rescue assessment of the damaged building.'),
   job('A kitchen catches fire and the cook has suffered burns. Which response fits?',
    ['The fire is still burning.','The cook needs urgent medical care.','No violence is reported.'],
    'Fire crew + Ambulance','Police only','Ambulance only','Fire crews tackle the flames and ambulance staff treat burns.'),
   job('After a violent collision, an injured passenger is trapped and a fight breaks out nearby.',
    ['The passenger cannot get out.','Medical help is needed.','There is an active threat near the scene.'],
    'Police + Ambulance + Fire crew','Police only','Fire crew only',
    'The combined dangers need police for safety, ambulance for injuries and fire crew for rescue.'),
  ],
 },
 bus:{
  easy:[
   job('Your bus stop is closed for roadworks. Where should the driver go?',
    ['The next authorised stop is open.','The closed stop cannot be used.'],
    'Use the open authorised stop','Stop inside the construction area','Skip the whole route without telling anyone',
    'The open authorised stop is the safe place to serve passengers.'),
   job('A passenger has been waiting at the correct bus stop. What should the driver do?',
    ['The bus is running its scheduled route.','The stop is open and safe to use.'],
    'Stop and pick up the passenger','Drive past without stopping','Change routes randomly',
    'Serve the scheduled stop when it is safe and open.'),
   job('The bus dashboard warns that the doors will not close. What now?',
    ['The bus cannot travel safely with the faulty doors.'],
    'Stop service and report the fault','Drive with the doors open','Ignore the warning',
    'A bus with unsafe doors needs repair before continuing.'),
   job('A driver reports a flat tyre. What should Dispatch arrange?',
    ['The bus cannot safely complete its route.','A replacement bus is available.'],
    'Send the replacement bus','Tell the driver to keep driving','Cancel every bus service in the city',
    'A replacement keeps passengers moving without using an unsafe bus.'),
   job('Two bus routes are shown. Which serves the hospital?',
    ['Route 4 stops at the hospital.','Route 9 stops at the stadium.'],
    'Route 4','Route 9','Neither route','Route 4 goes to the requested hospital stop.'),
   job('A driver has finished the shift. What is the correct next action?',
    ['A relief driver is ready to take over.'],
    'Hand over safely to the relief driver','Leave the bus running unattended','Start a new route without a driver',
    'A safe handover lets service continue with the relief driver.'),
  ],
  hard:[
   job('Two routes need a spare bus. Who gets it first?',
    ['Route A has broken down with many passengers waiting.','Route B is running normally but five minutes late.','Only one spare bus is available.'],
    'Send the spare to stranded Route A','Replace the working Route B bus','Keep the spare parked',
    'Passengers stranded by the breakdown need the spare most urgently.'),
   job('Roadworks block a bus route and the replacement driver is new. What is safest?',
    ['An official detour is open.','The new driver has the detour instructions.','A shortcut has not been checked.'],
    'Use the approved detour and brief the driver','Send the driver on the unknown shortcut','Continue into the closed road',
    'A confirmed detour with clear driver instructions is safest.'),
   job('Two buses are late, but only one relief driver is available. Which plan works?',
    ['Bus A driver is out of permitted hours.','Bus B is late but its driver can continue safely.'],
    'Assign relief driver to Bus A','Put the relief driver on Bus B','Ask Bus A driver to exceed safe hours',
    'The driver who cannot continue needs relief before someone merely running late.'),
   job('A school bus and a regular bus both request help. Who should Dispatch prioritise?',
    ['School bus has stalled with children on board.','Regular bus is running but five minutes late.','A spare bus is available.'],
    'Send the spare to the stranded school bus','Replace the working regular bus','Ignore both calls',
    'The stranded group needs safe replacement transport before a small timetable delay.'),
   job('One city street closes during rush hour. Which service plan is best?',
    ['Three buses use the street.','An approved bypass serves their main stops.','The blocked street cannot be entered.'],
    'Reroute all affected buses via the approved bypass','Keep sending buses into the closure','Cancel every route in the network',
    'A coordinated detour keeps services running without entering the closure.'),
   job('Two buses have arrived together after delays. How should you restore even spacing?',
    ['The next bus is twenty minutes behind.','Both current buses are safe at the terminal.','Dispatch can adjust departures.'],
    'Space their departures instead of sending both together','Release both at the same moment','Take both out of service',
    'Spacing departures reduces long gaps between services.'),
  ],
 },

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
export function createDispatchAssignment({level,difficulty,careerId,rng=randomInt}){
 if(!['easy','hard'].includes(difficulty))throw new Error('INVALID_DIFFICULTY');
 const mission=dispatchCareer(careerId);
 if(!mission)throw new Error('CAREER_REQUIRED');
 // As contractor level increases, NEW incidents unlock in this same career.
 // Levels 1–4: 4 situations, 5–9: 5, 10+: entire question pool.
 // This changes assignments without changing a player's chosen career.
 const allTemplates=catalog[mission.id][difficulty];
 const count=level>=10?allTemplates.length:level>=5?Math.min(5,allTemplates.length):Math.min(4,allTemplates.length);
 const templates=allTemplates.slice(0,count);
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
  const assignment=createDispatchAssignment({level:view.level,difficulty,careerId:state.careerId,rng});
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
