import { MessageFlags } from 'discord.js';
import { createEmbed } from '../../../../utils/embeds.js';
import { InteractionHelper } from '../../../../utils/interactionHelper.js';
import { mutateServerProgression,registerFoundingServers,getFoundingBadge,FOUNDING_CAP } from '../../../../services/serverProgressionService.js';

import { isPrimaryBotOwner } from '../../../../config/bot.js';

// Internal action owned by /ownerstats. Not a standalone Discord command.
export default {
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
    const registryBefore=await interaction.client.db.get('beacon:founders:v1',{entries:[]});
    const oldGuilds=new Set((registryBefore?.entries||[]).map(x=>x.guildId));
    const {data,result}=await mutateServerProgression(interaction.client,serverId,current=>{
      if(current.leaderboardExcluded===true)return {changed:false};
      current.leaderboardExcluded=true;
      return {changed:true};
    });
    // Retry registration even when previously excluded: repairs old test guilds.
    let founders,successor=null;
    try{
      founders=await registerFoundingServers(interaction.client);
      if(previousFounder)successor=founders.find(x=>!oldGuilds.has(x.guildId))||null;
    }catch(error){
      return InteractionHelper.safeReply(interaction,{
        content:'⚠️ Leaderboard exclusion saved, but Founder reassignment failed. Run the command again to retry.',
        flags:MessageFlags.Ephemeral,
      });
    }
    const badge=previousFounder?
      successor
       ?'🌟 Founder #'+previousFounder.number+' revoked. Higher badges shifted down by one; **'+
         (interaction.client.guilds.cache.get(successor.guildId)?.name||successor.guildId)+
         '** now holds Founder #'+successor.number+'.'
       :'🌟 Founder #'+previousFounder.number+
         ' revoked. Higher badges shifted down by one; no replacement is currently eligible.'
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
          {name:'🏅 Active Founders',value:String(founders.length)+' / '+FOUNDING_CAP,inline:true},
        ],
        footer:'XP and owned cosmetics stay saved. Excluded servers cannot regain a Founder badge.',
      })],flags:MessageFlags.Ephemeral,
    });
  },
};