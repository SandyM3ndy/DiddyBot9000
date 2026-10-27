import { SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getTreasury,wallAt,TREASURY_DEFENCES } from '../../services/treasuryService.js';
import { logger } from '../../utils/logger.js';

const timers=new Map();
export function stopHeistTicker(raidId){
 const timer=timers.get(raidId);
 if(timer){clearInterval(timer);timers.delete(raidId);}
}
export function buildHeistChallenge(raid,targetName,defence,now=Date.now()){
 const wall=wallAt(raid,now);
 if(wall<0)return {embeds:[createEmbed({title:'⏳ Treasury Heist — Time Up',
  description:'The wall moved out of reach. This heist will be marked as caught.',color:'danger'})],components:[]};
 const left=Math.max(0,Math.ceil((raid.endsAt-now)/1000));
 const wallRow=new ActionRowBuilder(),hitRow=new ActionRowBuilder();
 for(let i=0;i<3;i++){
  wallRow.addComponents(new ButtonBuilder().setCustomId('heist_marker:'+i)
   .setLabel(wall===i?'🧱':'·').setStyle(ButtonStyle.Secondary).setDisabled(true));
  hitRow.addComponents(new ButtonBuilder().setCustomId('heist_hit:'+raid.id+':'+i)
   .setLabel('Hit '+(i+1)).setStyle(ButtonStyle.Primary));
 }
 return {embeds:[createEmbed({title:'⚔️ Treasury Heist • Moving Wall',
  description:'Target: **'+String(targetName).replace(/[*_~<>|]/g,'').slice(0,70)+'**\n'+
   'The **🧱 wall moves every second** across the top row.\n'+
   '**Hit the button directly below it** before the timer ends.\n\n'+
   '**'+left+' seconds remaining** • One shot only.\n'+
   'Hitting correctly gives you a '+TREASURY_DEFENCES[defence-1].chance+
   '% chance of winning. If caught, your server loses 3% of its treasury.',color:'warning'})],
  components:[wallRow,hitRow],allowedMentions:{parse:[]}};
}
export function startHeistTicker(message,client,guildId,raid,targetName,defence){
 stopHeistTicker(raid.id);
 let editing=false;
 const timer=setInterval(async()=>{
  if(editing)return;
  editing=true;
  try{
   const now=Date.now();
   if(now>=raid.endsAt){
    stopHeistTicker(raid.id);
    const {resolveTreasuryHeist}=await import('../../services/treasuryService.js');
    const result=await resolveTreasuryHeist(client,{guildId,raidId:raid.id,actorId:null,now});
    await message.edit(heistOutcome(result));
   }else await message.edit(buildHeistChallenge(raid,targetName,defence,now));
  }catch(error){
   logger.warn('Treasury heist ticker update failed',{guildId,raidId:raid.id,error:error.message});
   if(Date.now()>=raid.endsAt)stopHeistTicker(raid.id);
  }finally{editing=false;}
 },1000);
 timers.set(raid.id,timer);
 if(timers.size>100){const first=timers.keys().next().value;stopHeistTicker(first);}
}
export function heistOutcome(result){
 return {embeds:[createEmbed({title:result.success?'🏆 TREASURY HEIST SUCCESSFUL':'🚨 HEIST FAILED — CAUGHT',
  description:result.success?
   '**'+result.amount.toLocaleString('en-US')+' Sand Coins** were transferred to your server treasury from **'+result.targetName+'**!':
   'The security team caught the attackers. Your server lost **'+result.amount.toLocaleString('en-US')+
   ' Sand Coins (3% of its treasury)** in the penalty.'+
   (result.forfeited?' **'+result.forfeited.toLocaleString('en-US')+' SC** was forfeited because the target treasury is full.':'')+'\n'+
   (!result.hit?'You missed the moving wall or ran out of time.':'You hit the wall, but the defence roll caught you.'),
  fields:[{name:'Target Defence',value:'Success chance: '+result.chance+'%',inline:true},
   {name:'Defender Shield',value:'Protection ends <t:'+Math.floor(result.shieldUntil/1000)+':R>',inline:true}],
  color:result.success?'success':'danger',footer:'Beacon • Treasury Wars • Outcome saved permanently'})],
  components:[],allowedMentions:{parse:[]}};
}
export async function buildHeistPanel(client,guildId){
 const s=await getTreasury(client,guildId),now=Date.now();
 const ready=s.enabled&&s.balance>=500&&s.raidCooldownUntil<=now;
 const description='**Server treasury:** '+s.balance.toLocaleString('en-US')+' SC\n'+
  '**Opted into raids:** '+(s.enabled?'Yes':'No')+'\n'+
  '**1.2× XP bonus:** '+(s.enabled&&s.balance>=500?'Active':'Inactive')+'\n'+
  (s.raidCooldownUntil>now?'**Next raid available:** <t:'+Math.floor(s.raidCooldownUntil/1000)+':R>\n':'')+
  (s.shieldUntil>now?'**Your shield expires:** <t:'+Math.floor(s.shieldUntil/1000)+':R>\n':'')+
  '\n**Raid rules:** One moving-wall stage, three buttons, 12 seconds. '+
  'Hit the wall to roll against the target vault security. Get caught and lose **3%** from your treasury.\n'+
  'Successful targets receive 24-hour shields. Attacks have a 24-hour cooldown.';
 return {embeds:[createEmbed({title:'⚔️ Beacon Treasury Wars',description,color:'primary'})],
  components:[new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('heist_launch').setLabel('Launch Random Heist')
    .setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(!ready),
   new ButtonBuilder().setCustomId('heist_refresh').setLabel('Refresh')
    .setEmoji('🔄').setStyle(ButtonStyle.Secondary))],
  allowedMentions:{parse:[]}};
}
export default {
 data:new SlashCommandBuilder().setName('heist').setDescription('Open the Treasury Wars raid dashboard'),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Run /heist in a Beacon server.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply();
  return interaction.editReply(await buildHeistPanel(interaction.client,interaction.guildId));
 }
};
