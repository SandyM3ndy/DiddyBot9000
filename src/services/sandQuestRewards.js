/**
 * Shared server quests give XP to the server and Sand Coins to eligible people.
 * Never reward a message/command by itself; only completed quests issue claims.
 */
const MAX_RECIPIENTS=20;
export function questCoinAmount(quest,weekly=false){
 if(weekly)return 60;
 return quest.difficulty==='Hard'?35:quest.difficulty==='Medium'?25:15;
}
export function minimumContribution(quest){
 if(['uniqueMembers','newMembers','channels','activeDays'].includes(quest.metric))return 1;
 return Math.max(2,Math.min(3,Math.ceil(quest.target*0.1)));
}
export function eligibleSandContributors(quest,contributions){
 const threshold=minimumContribution(quest);
 return Object.entries(contributions||{})
  .filter(([userId,n])=>/^\d{17,20}$/.test(userId)&&Number.isFinite(n)&&n>=threshold)
  .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
  .slice(0,MAX_RECIPIENTS).map(([userId])=>userId);
}
export function recordQuestContribution(data,guildId,metric,options,completedDaily,baseXp){
 const store=data.sandContributions;
 if(!store||!options.userId)return;
 const userId=options.userId;
 const add=(map,quest,amount=1)=>{
  map[quest.id] ||= {};
  map[quest.id][userId]=(map[quest.id][userId]||0)+amount;
 };
 for(const quest of data.dailyQuests){
  if(quest.completed)continue;
  if((metric==='message'&&(['messages','channels','uniqueMembers'].includes(quest.metric)))||
     (metric==='command'&&quest.metric==='commands')||
     (metric==='newMembers'&&quest.metric==='newMembers')){
   add(store.daily,quest);
  }
 }
 for(const quest of data.weekly?.quests||[]){
  if(quest.completed)continue;
  if((metric==='message'&&['messages','activeDays','uniqueMembers','activityXp'].includes(quest.metric))||
     (metric==='command'&&['commands','activeDays','uniqueMembers','activityXp'].includes(quest.metric))||
     (completedDaily>0&&quest.metric==='dailyQuests')){
    const amount=quest.metric==='dailyQuests'?completedDaily:quest.metric==='activityXp'?baseXp:1;
    add(store.weekly,quest,amount);
  }
 }
}
export function queueSharedSandRewards(data,guildId,completedDaily,completedWeekly){
 data.sandPendingPayouts ||= [];
 const dailyDay=data.lastQuestDay,week=data.weekly?.week;
 for(const [quests,period,contributions,isWeekly] of [
  [completedDaily,'daily',data.sandContributions?.daily,false],
  [completedWeekly,'weekly',data.sandContributions?.weekly,true],
 ]){
  const stamp=isWeekly?week:dailyDay;
  for(const quest of quests){
   const eligible=eligibleSandContributors(quest,contributions?.[quest.id]);
   for(const userId of eligible){
    const eventId=guildId+':'+period+':'+stamp+':'+quest.id;
    const key=eventId+':'+userId;
    if(data.sandPendingPayouts.some(p=>p.key===key))continue;
    data.sandPendingPayouts.push({key,eventId,userId,guildId,
     amount:questCoinAmount(quest,isWeekly),weekly:isWeekly});
   }
  }
 }
 return data.sandPendingPayouts;
}
