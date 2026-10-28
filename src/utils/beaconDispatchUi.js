import { ActionRowBuilder,ButtonBuilder,ButtonStyle } from 'discord.js';
import { createEmbed } from './embeds.js';
import { DISPATCH_LIMITS,DISPATCH_MISSIONS,dispatchNextLevelXp,dispatchBaseReward } from '../services/beaconDispatchService.js';

const row=(...buttons)=>new ActionRowBuilder().addComponents(...buttons);
const button=(id,label,emoji,style=ButtonStyle.Secondary,disabled=false)=>
 new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
const time=ts=>'<t:'+Math.floor(ts/1000)+':R>';
const nextDay=now=>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
const nextWeek=now=>Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+(7-((now.getUTCDay()+6)%7)));
const coins=n=>Number(n||0).toLocaleString('en-US')+' SC';

export function buildDispatchBoard(profile,now=new Date(),notice=''){
 const maxLevel=profile.level>=DISPATCH_LIMITS.maxLevel;
 const unlocked=DISPATCH_MISSIONS.filter(m=>profile.level>=m.unlock);
 const locked=DISPATCH_MISSIONS.filter(m=>profile.level<m.unlock);
 const active=profile.active;
 const restriction={
  ACTIVE:'Your current assignment is still active. Resume or abandon it.',
  DAILY_ATTEMPTS:'You have reached your 3 assignment starts today. Resets '+time(nextDay(now))+'.',
  DAILY_CAP:'You have reached the Dispatch daily earnings cap. Resets '+time(nextDay(now))+'.',
  WEEKLY_CAP:'You have reached the Dispatch weekly earnings cap. Resets '+time(nextWeek(now))+'.',
  COOLDOWN:'Your next assignment is available '+time(profile.cooldownUntil)+'.',
 };
 const fields=[
  {name:'🏅 Contractor Level',value:'**'+profile.level+'/'+DISPATCH_LIMITS.maxLevel+'** • '+profile.xp+
    ' XP'+(maxLevel?' • MAX':' • '+(dispatchNextLevelXp(profile.level)-profile.xp)+' XP to next level'),inline:true},
  {name:'💰 Dispatch Budget',value:'Today: **'+coins(profile.remainingToday)+'** remaining\nThis week: **'+coins(profile.remainingWeek)+'** remaining',inline:true},
  {name:'📑 Assignments',value:'**'+(DISPATCH_LIMITS.attemptsPerDay-profile.startsToday)+'/'+DISPATCH_LIMITS.attemptsPerDay+
   '** available today • 20-minute cooldown after starting',inline:false},
  {name:'📡 Unlocked Assignments',value:unlocked.map(m=>m.emoji+' '+m.name).join(' • '),inline:false},
 ];
 if(locked.length)fields.push({name:'🔒 Future Divisions',value:locked.map(m=>m.name+' • Level '+m.unlock).join('\n')});
 if(profile.lastResult)fields.push({name:'🧾 Last Assignment',value:profile.lastResult.missionEmoji+' '+
  profile.lastResult.missionName+' ('+profile.lastResult.difficulty.toUpperCase()+') • '+
  (profile.lastResult.passed?'+'+coins(profile.lastResult.coins):'No payment')});
 const embed=createEmbed({title:'📡 Beacon Dispatch Network',
  description:'**Contractor Operations Terminal**\nComplete interactive assignments to earn **global Sand Coins**. '+
   'Hard assignments have tougher decisions and pay **2× the equivalent Easy reward** at the same level/performance.'+
   '\n\n'+(active?'**Active assignment:** '+active.missionEmoji+' '+active.missionName+' • '+
    active.difficulty.toUpperCase()+' • Expires '+time(active.expiresAt):
    (restriction[profile.reason]||'**Ready for your next assignment.**'))+
   (notice?'\n\n'+notice:''),
  fields,color:'primary',footer:'Global contractor levels • No leaderboard • Limits and cooldowns follow you across servers'});
 const rows=[];
 if(active){
  rows.push(row(
   button('sand_dispatch:resume:'+active.token,'Resume Mission','▶️',ButtonStyle.Primary),
   button('sand_dispatch:abandon:'+active.token,'Abandon','🛑',ButtonStyle.Danger),
  ));
 }else{
  const disabled=!profile.canStart;
  const base=dispatchBaseReward(profile.level);
  rows.push(row(
   button('sand_dispatch:start:easy','Easy • Up to '+coins(base),'📦',ButtonStyle.Success,disabled),
   button('sand_dispatch:start:hard','Hard • Up to '+coins(base*2),'⚡',ButtonStyle.Primary,disabled),
  ));
 }
 rows.push(row(button('sand_wallet:home','Return to Wallet','🪙')));
 return {embeds:[embed],components:rows,content:'',allowedMentions:{parse:[]},attachments:[]};
}

export function buildDispatchMission(profile,userId,feedback=null){
 const a=profile.active;
 if(!a) return buildDispatchBoard(profile);
 const stage=a.stages[a.stage];
 const answerButtons=stage.options.map((option,index)=>row(button(
  'sand_dispatch:pick:'+userId+':'+a.token+':'+a.stage+':'+index,
  String.fromCharCode(65+index)+' • '+option,'📍',ButtonStyle.Secondary)));
 const embed=createEmbed({title:a.missionEmoji+' '+a.missionName+' • '+a.difficulty.toUpperCase(),
  description:'**BDN CONTRACT #'+a.token.toUpperCase()+'**\nStage **'+(a.stage+1)+'/'+a.stages.length+
   '** • Correct answers: **'+a.correct+'**\nExpires '+time(a.expiresAt)+
   '\n\n**DISPATCH CONTROL:** '+stage.question,
  fields:[{name:'📋 Verified operational information',value:stage.clues.map((clue,i)=>String(i+1)+'. '+clue).join('\n')},
   {name:'Select an answer',value:'Choose carefully. Every answer is final, and Hard assignments require at least 75% accuracy.'}],
  color:a.difficulty==='hard'?'warning':'primary',
  footer:'No coin deductions for mistakes • Payout only after every stage'});
 const notice=feedback?(feedback.correct?'✅ Correct. ':'⚠️ Incorrect. ')+feedback.explanation:'';
 return {embeds:[embed],components:[...answerButtons,row(
  button('sand_dispatch:board','Assignment Board','📡'),
  button('sand_dispatch:abandon:'+a.token,'Abandon Assignment','🛑',ButtonStyle.Danger))],
  content:notice,allowedMentions:{parse:[]},attachments:[]};
}
export function buildDispatchResult(profile,result){
 const next=profile.level===result.newLevel?'':
  '\n🎉 **LEVEL UP!** Contractor Level '+result.newLevel+' unlocked.';
 const embed=createEmbed({
  title:result.passed?'✅ Dispatch Completed':'📋 Dispatch Closed',
  description:result.missionEmoji+' **'+result.missionName+'** • '+result.difficulty.toUpperCase()+
   '\n**'+result.correct+'/'+result.total+'** verified decisions'+
   '\n\n**'+(result.passed?'+'+coins(result.coins):'No payment')+'** awarded to your global wallet.'+
   (!result.passed?'\nNot enough correct decisions to qualify for a payout.':'')+
   (result.rawReward>result.coins?'\nThe global Dispatch earnings cap limited this payout.':'')+next,
  fields:[{name:'Contractor Progress',value:'Level '+profile.level+' • '+profile.xp+' XP',inline:true},
   {name:'XP earned',value:'+'+result.xpGain+' XP',inline:true},
   {name:'Budget Remaining',value:coins(profile.remainingToday)+' today • '+coins(profile.remainingWeek)+' this week'}],
  color:result.passed?'success':'warning',
  footer:'Transaction confirmed in PostgreSQL • No leaderboard'});
 return {embeds:[embed],components:[row(
  button('sand_dispatch:board','Assignment Board','📡',ButtonStyle.Primary),
  button('sand_wallet:home','Wallet','🪙'))],
  content:'',allowedMentions:{parse:[]},attachments:[]};
}
