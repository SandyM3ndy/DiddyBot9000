import { ActionRowBuilder,ButtonBuilder,ButtonStyle } from 'discord.js';
import { createEmbed } from './embeds.js';
import { BEACON_IDENTITY } from '../config/beaconIdentity.js';
import { DISPATCH_LIMITS,DISPATCH_MISSIONS,dispatchCareer,dispatchNextLevelXp,dispatchBaseReward } from '../services/beaconDispatchService.js';

const row=(...buttons)=>new ActionRowBuilder().addComponents(...buttons);
const button=(id,label,emoji,style=ButtonStyle.Secondary,disabled=false)=>
 new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
const time=ts=>'<t:'+Math.floor(ts/1000)+':R>';
const nextDay=now=>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
const nextWeek=now=>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+(7-((now.getUTCDay()+6)%7)));
const coins=n=>Number(n||0).toLocaleString('en-US')+' SC';

export function buildDispatchCareerPicker(profile,notice=''){
 const jobs=DISPATCH_MISSIONS;
 const embed=createEmbed({
  title:'📡 '+BEACON_IDENTITY.surfaces.dispatch+' • Choose Your Career',
  description:'**Welcome to the Dispatch Network.** Pick **one permanent job** to work in.'+
   '\n\nYou will receive assignments only for your chosen career. You can resign and choose a different job later, but **switching does not reset cooldowns, earnings limits or contractor XP**.'+
   '\n\n**Easy:** 3 simple decisions • **Hard:** 4 harder decisions for 2× rewards.'+
   (notice?'\n\n'+notice:''),
  fields:jobs.map(j=>({name:j.emoji+' '+j.name,value:j.description})),
  color:'primary',footer:'Beacon Network • Five careers from Level 1 • No leaderboard'});
 const shortLabels={
  emergency:'Emergency Response',bus:'Bus Operations',courier:'Courier Logistics',
  relay:'Communications',systems:'Facility Operations',
 };
 const jobButtons=jobs.map(j=>button('sand_dispatch:career:'+j.id,
  shortLabels[j.id]||j.name,j.emoji));
 return {embeds:[embed],components:[
  row(...jobButtons.slice(0,3)),
  row(...jobButtons.slice(3)),
  row(button('sand_wallet:home','Back to Wallet','🪙')),
 ],content:'',allowedMentions:{parse:[]},attachments:[]};
}

export function buildDispatchResignation(profile){
 const career=dispatchCareer(profile.careerId);
 if(!career)return buildDispatchCareerPicker(profile);
 const embed=createEmbed({
  title:'🚪 Leave Your Dispatch Job?',
  description:'You are currently working as **'+career.emoji+' '+career.name+'**.'+
   '\n\nIf you resign, you can choose **one of the five careers** again.'+
   '\n\n**Your contractor level, XP, completed jobs, Sand Coins and earning limits are all kept.**'+
   '\n\nYou cannot resign while an assignment is active. Finish or abandon it first.',
  color:'warning',footer:'Career changes do not reset daily attempts or cooldowns'});
 return {embeds:[embed],components:[row(
  button('sand_dispatch:confirm-resign','Yes, Leave Job','🚪',ButtonStyle.Danger),
  button('sand_dispatch:board','Keep My Job','✅',ButtonStyle.Primary),
 )],content:'',allowedMentions:{parse:[]},attachments:[]};
}

export function buildDispatchBoard(profile,now=new Date(),notice=''){
 const career=dispatchCareer(profile.careerId);
 // Existing contractors with unfinished assignments from the old random-job
 // system can resume them even though they have not chosen a career yet.
 if(!career&&!profile.active)return buildDispatchCareerPicker(profile,notice);
 const active=profile.active;
 const restriction={
  ACTIVE:'Your current assignment is still active. Resume or abandon it.',
  DAILY_ATTEMPTS:'You have reached your 3 assignment starts today. Resets '+time(nextDay(now))+'.',
  DAILY_CAP:'You have reached the Dispatch daily earnings cap. Resets '+time(nextDay(now))+'.',
  WEEKLY_CAP:'You have reached the Dispatch weekly earnings cap. Resets '+time(nextWeek(now))+'.',
  COOLDOWN:'Your next assignment is available '+time(profile.cooldownUntil)+'.',
  NO_CAREER:'Choose a Dispatch job when your current assignment is complete.',
 };
 const fields=[
  {name:'🏢 Your Permanent Career',value:career?career.emoji+' **'+career.name+'**':'Previously started assignment',inline:false},
  {name:'🏅 Contractor Level',value:'**'+profile.level+'/'+DISPATCH_LIMITS.maxLevel+'** • '+profile.xp+
    ' XP'+(profile.level>=DISPATCH_LIMITS.maxLevel?' • MAX':' • '+(dispatchNextLevelXp(profile.level)-profile.xp)+' XP to next level'),inline:true},
  {name:'💰 Dispatch Budget',value:'Today: **'+coins(profile.remainingToday)+'** remaining\nThis week: **'+coins(profile.remainingWeek)+'** remaining',inline:true},
  {name:'📑 Assignments',value:'**'+(DISPATCH_LIMITS.attemptsPerDay-profile.startsToday)+'/'+DISPATCH_LIMITS.attemptsPerDay+
   '** starts left today • 20-minute cooldown after starting',inline:false},
  {name:'🚀 Career Progression',value:profile.level>=10?'Advanced scenarios unlocked':
   profile.level>=5?'More involved scenarios unlocked • Next: Level 10':'More involved scenarios at Level 5 • Advanced scenarios at Level 10'},
 ];
 if(profile.lastResult)fields.push({name:'🧾 Last Assignment',value:profile.lastResult.missionEmoji+' '+
  profile.lastResult.missionName+' ('+profile.lastResult.difficulty.toUpperCase()+') • '+
  (profile.lastResult.passed?'+'+coins(profile.lastResult.coins):'No payment')});
 const embed=createEmbed({title:'📡 '+BEACON_IDENTITY.surfaces.dispatch+' • '+(career?career.name:'Active Contract'),
  description:'**Your assignment desk.** All jobs here belong to your selected career.\n'+
   '📦 **Easy:** 3 questions; get at least 2 right.\n'+
   '⚡ **Hard:** 4 tougher questions; get at least 3 right for **2× Sand Coins**.'+
   '\n\n'+(active?'**Active assignment:** '+active.missionEmoji+' '+active.missionName+' • '+
    active.difficulty.toUpperCase()+' • Expires '+time(active.expiresAt):
    (restriction[profile.reason]||'**Ready for your next assignment.**'))+
   (notice?'\n\n'+notice:''),
  fields,color:'primary',footer:'Beacon Network • Career travels across servers • No leaderboard'});
 const rows=[];
 if(active){
  rows.push(row(
   button('sand_dispatch:resume:'+active.token,'Resume Assignment','▶️',ButtonStyle.Primary),
   button('sand_dispatch:abandon:'+active.token,'Abandon Assignment','🛑',ButtonStyle.Danger),
  ));
 }else{
  const disabled=!profile.canStart;
  const base=dispatchBaseReward(profile.level);
  rows.push(row(
   button('sand_dispatch:start:easy','Easy • Up to '+coins(base),'📦',ButtonStyle.Success,disabled),
   button('sand_dispatch:start:hard','Hard • Up to '+coins(base*2),'⚡',ButtonStyle.Primary,disabled),
  ));
 }
 rows.push(row(
  button('sand_wallet:home','Return to Wallet','🪙'),
  button('sand_dispatch:resign','Change Career','🔄',ButtonStyle.Secondary,!career||Boolean(active)),
 ));
 return {embeds:[embed],components:rows,content:'',allowedMentions:{parse:[]},attachments:[]};
}
export function buildDispatchMission(profile,userId,feedback=null){
 const a=profile.active;
 if(!a) return buildDispatchBoard(profile);
 const stage=a.stages[a.stage];
 const answerButtons=stage.options.map((option,index)=>row(button(
  'sand_dispatch:pick:'+userId+':'+a.token+':'+a.stage+':'+index,
  String.fromCharCode(65+index)+' • '+option,'📍',ButtonStyle.Secondary)));
 const embed=createEmbed({title:a.missionEmoji+' '+BEACON_IDENTITY.surfaces.dispatch+' • '+a.missionName+' • '+a.difficulty.toUpperCase(),
  description:'**BDN CONTRACT #'+a.token.toUpperCase()+'**\nStage **'+(a.stage+1)+'/'+a.stages.length+
   '** • Correct answers: **'+a.correct+'**\nExpires '+time(a.expiresAt)+
   '\n\n**Your situation:** '+stage.question,
  fields:[{name:'📋 Here is what you know',value:stage.clues.map((clue,i)=>String(i+1)+'. '+clue).join('\n')},
   {name:'What would you do?',value:a.difficulty==='hard'?
    'Pick the best choice. You need **3 of 4 correct** for payment.':'Pick the best choice. You need **2 of 3 correct** for payment.'}],
  color:a.difficulty==='hard'?'warning':'primary',
  footer:'Beacon Dispatch • Mistakes never cost coins • Complete every stage'});
 const notice=feedback?(feedback.correct?'✅ Correct. ':'⚠️ Incorrect. ')+feedback.explanation:'';
 return {embeds:[embed],components:[...answerButtons,row(
  button('sand_dispatch:board','Assignment Board','📡'),
  button('sand_dispatch:abandon:'+a.token,'Abandon Assignment','🛑',ButtonStyle.Danger))],
  content:notice,allowedMentions:{parse:[]},attachments:[]};
}
export function buildDispatchResult(profile,result,feedback=null){
 const next=result.priorLevel===result.newLevel?'':
  '\n🎉 **LEVEL UP!** Contractor Level '+result.newLevel+' unlocked.';
 const embed=createEmbed({
  title:result.passed?'✅ Beacon Dispatch • Completed':'📋 Beacon Dispatch • Closed',
  description:result.missionEmoji+' **'+result.missionName+'** • '+result.difficulty.toUpperCase()+
   '\n**'+result.correct+'/'+result.total+'** verified decisions'+
   '\n\n**'+(result.passed?'+'+coins(result.coins):'No payment')+'** awarded to your global wallet.'+
   (!result.passed?'\nNot enough correct decisions to qualify for a payout.':'')+
   (result.rawReward>result.coins?'\nThe global Dispatch earnings cap limited this payout.':'')+next+
   (feedback?'\n\n**Final answer:** '+(feedback.correct?'✅ Correct. ':'❌ Not quite. ')+feedback.explanation:''),
  fields:[{name:'Contractor Progress',value:'Level '+profile.level+' • '+profile.xp+' XP',inline:true},
   {name:'XP earned',value:'+'+result.xpGain+' XP',inline:true},
   {name:'Budget Remaining',value:coins(profile.remainingToday)+' today • '+coins(profile.remainingWeek)+' this week'}],
  color:result.passed?'success':'warning',
  footer:'Beacon Network • Saved global payout • No leaderboard'});
 return {embeds:[embed],components:[row(
  button('sand_dispatch:board','Assignment Board','📡',ButtonStyle.Primary),
  button('sand_wallet:home','Wallet','🪙'))],
  content:'',allowedMentions:{parse:[]},attachments:[]};
}
