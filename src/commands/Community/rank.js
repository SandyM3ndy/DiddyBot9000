import { SlashCommandBuilder,MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
 getServerProgression,getLevelProgress,getGlobalProgressionLeaderboard,
} from '../../services/serverProgressionService.js';
import {
 isRankCardId,loadLiveRankCard,buildRankCardDisplay,
} from '../../services/rankCardGalleryService.js';

function progressBar(percent){
 const filled=Math.max(0,Math.min(12,Math.round(percent*12/100)));
 return '▰'.repeat(filled)+'▱'.repeat(12-filled)+' '+percent+'%';
}

export default {
 data:new SlashCommandBuilder()
  .setName('rank')
  .setDescription('View server ranks and share cosmetic rank cards across Beacon servers')
  .setDMPermission(false)
  .addSubcommand(s=>s.setName('server')
   .setDescription('View this server’s XP, level and world ranking'))
  .addSubcommand(s=>s.setName('card')
   .setDescription('Show any public Beacon server rank card and its equipped cosmetics')
   .addStringOption(o=>o.setName('server_id')
    .setDescription('ID of a server that has Beacon and public progression')
    .setRequired(true).setMinLength(17).setMaxLength(20))),
 category:'Community',
 async execute(interaction){
  if(!interaction.guildId)return InteractionHelper.safeReply(interaction,{
   content:'Use /rank in a Beacon server.',flags:MessageFlags.Ephemeral,
  });
  const sub=interaction.options?.getSubcommand?.(false)||'server';
  if(sub==='card'){
   const targetId=interaction.options.getString('server_id',true).trim();
   if(!isRankCardId(targetId))return InteractionHelper.safeReply(interaction,{
    content:'⚠️ Enter a valid Discord server ID (17–20 digits).',
    flags:MessageFlags.Ephemeral,
   });
   // Public sharing: a viewer can copy or pin this message normally.
   if(!(await InteractionHelper.safeDefer(interaction,{})))return;
   try{
    const card=await loadLiveRankCard(interaction.client,targetId);
    return InteractionHelper.safeEditReply(interaction,
     buildRankCardDisplay(card,{ownerId:interaction.user.id}));
   }catch(error){
    if(['SERVER_NOT_FOUND','PROGRESSION_NOT_PUBLIC'].includes(error.message))
     return InteractionHelper.safeEditReply(interaction,{
      content:'🔎 No public rank card found for that server. Beacon must be a member and the server must have public progression enabled.',
     });
    throw error;
   }
  }
  if(!(await InteractionHelper.safeDefer(interaction,{})))return;
  const [data,entries]=await Promise.all([
   getServerProgression(interaction.client,interaction.guildId),
   getGlobalProgressionLeaderboard(interaction.client),
  ]);
  const progress=getLevelProgress(data);
  const index=entries.findIndex(entry=>entry.guildId===interaction.guildId);
  const next=index>0?entries[index-1]:null;
  const guildName=String(interaction.guild?.name||'This Server').replace(/[*_~<>|]/g,'').slice(0,70);
  const embed=createEmbed({
   title:'🏆 '+guildName+' • Server Rank',
   description:'**Level '+data.level+'**  ·  **'+data.xp.toLocaleString()+' XP**\n'+
    progressBar(progress.percent)+'\n'+
    progress.progressXp.toLocaleString()+' / '+progress.neededXp.toLocaleString()+
    ' XP toward Level '+(data.level+1),
   color:'primary',
   fields:[
    {name:'🌍 Global Position',value:index>=0?'#'+(index+1)+' / '+entries.length:'Not ranked yet',inline:true},
    {name:'🎯 Daily Quests',value:data.dailyQuests.filter(q=>q.completed).length+
     ' / '+data.dailyQuests.length+' finished',inline:true},
    {name:'🔥 Next Rival',value:next?next.guildName+' • '+
     Math.max(0,next.xp-data.xp+1).toLocaleString()+' XP to pass':'No higher ranked rival',inline:false},
    {name:'💬 Tracked Messages',value:data.totalMessages.toLocaleString(),inline:true},
    {name:'🤖 Tracked Commands',value:data.totalCommands.toLocaleString(),inline:true},
   ],
   footer:'Use /rank card server_id:<ID> to share a server’s decorated rank card.',
  });
  return InteractionHelper.safeEditReply(interaction,{embeds:[embed]});
 },
};
