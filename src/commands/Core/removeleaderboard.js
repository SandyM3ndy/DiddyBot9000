import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { mutateServerProgression,registerFoundingServers,getFoundingBadge } from '../../services/serverProgressionService.js';

import { isPrimaryBotOwner } from '../../config/bot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removeleaderboard')
    .setDescription('Bot Owner Only • Exclude a server from the global leaderboard')
    .addStringOption(option => option
      .setName('server_id')
      .setDescription('The Discord server ID to remove from the leaderboard')
      .setRequired(true)),
  category: 'Owner',

  async execute(interaction) {
    if (!isPrimaryBotOwner(interaction.user.id)) {
      return InteractionHelper.safeReply(interaction, {
        content: '❌ You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const serverId = interaction.options.getString('server_id', true).trim();
    if (!/^\d{17,20}$/.test(serverId)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: '❌ Invalid Server ID', description: 'Please provide a valid Discord server ID.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = interaction.client.guilds.cache.get(serverId);
    if (!guild) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: '❌ Server Not Found', description: 'Beacon is not currently in that server.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const previousFounder=await getFoundingBadge(interaction.client,serverId);
    const {data,result}=await mutateServerProgression(interaction.client,serverId,current=>{
      if(current.leaderboardExcluded===true)return {changed:false};
      current.leaderboardExcluded=true;
      return {changed:true};
    });
    // Retry registration even when previously excluded: repairs old test guilds.
    let founders,successor=null;
    try{
      founders=await registerFoundingServers(interaction.client);
      if(previousFounder)successor=founders.find(x=>x.number===previousFounder.number)||null;
    }catch(error){
      return InteractionHelper.safeReply(interaction,{
        content:'⚠️ Leaderboard exclusion saved, but Founder reassignment failed. Run the command again to retry.',
        flags:MessageFlags.Ephemeral,
      });
    }
    const badge=previousFounder?
      successor&&successor.guildId!==serverId
       ?'🌟 Founder #'+previousFounder.number+' transferred to **'+
         (interaction.client.guilds.cache.get(successor.guildId)?.name||successor.guildId)+'**.'
       :'🌟 Founder #'+previousFounder.number+' revoked; its slot awaits an eligible server.'
      :'No Founder badge was assigned to this server.';
    return InteractionHelper.safeReply(interaction,{
      embeds:[createEmbed({
        title:result.changed?'🌎 Server Removed From Leaderboard':'🌎 Already Removed • Founder Registry Checked',
        description:'**'+guild.name+'** is excluded from global Server Progression rankings.\n\n'+badge,
        color:'success',
        fields:[
          {name:'🏠 Server',value:guild.name+' ('+serverId+')',inline:false},
          {name:'📈 Server XP',value:data.xp.toLocaleString(),inline:true},
          {name:'📊 Level',value:String(data.level),inline:true},
          {name:'🏅 Active Founders',value:String(founders.length)+' / 25',inline:true},
        ],
        footer:'XP and owned cosmetics stay saved. Excluded servers cannot regain a Founder badge.',
      })],flags:MessageFlags.Ephemeral,
    });
  },
};