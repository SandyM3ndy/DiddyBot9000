import { SlashCommandBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { gzipSync } from 'node:zlib';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isPrimaryBotOwner } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
  category:'Owner',
  ownerOnly:true,
  slashOnly:true,
  data:new SlashCommandBuilder()
    .setName('progressionexport')
    .setDescription('Bot Owner Only • Export a compressed backup of every Beacon progression record'),
  async execute(interaction){
    if(!isPrimaryBotOwner(interaction.user.id)){
      return InteractionHelper.safeReply(interaction,{content:'🔒 Beacon owner only.',flags:MessageFlags.Ephemeral});
    }
    if(!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
    if(interaction.client.db.isDegraded?.()){
      return InteractionHelper.safeEditReply(interaction,{content:'❌ Persistent PostgreSQL is offline; refusing a temporary-memory backup.'});
    }
    try{
      const keys=await interaction.client.db.list('guild:');
      const serverProgression={};
      for(const key of keys){
        if(!/^guild:\d+:progression$/.test(key))continue;
        const item=await interaction.client.db.get(key,null);
        if(item)serverProgression[key]=item;
      }
      const foundingRegistry=await interaction.client.db.get('beacon:founders:v1',{entries:[]});
      const backup={
        kind:'beacon-progression-export',schema:1,
        exportedAt:new Date().toISOString(),foundingRegistry,serverProgression,
      };
      const zipped=gzipSync(Buffer.from(JSON.stringify(backup,null,2)));
      if(zipped.length>20*1024*1024)
        return InteractionHelper.safeEditReply(interaction,{content:'❌ Export exceeds Discord file limits. Use the server-side PostgreSQL backup instead.'});
      const filename='beacon-progression-'+new Date().toISOString().slice(0,10)+'.json.gz';
      return InteractionHelper.safeEditReply(interaction,{
        embeds:[createEmbed({title:'🛡️ Progression Backup Exported',
          description:'Exported **'+Object.keys(serverProgression).length+
            ' servers** and the permanent Founding Community registry.\n\nKeep this file in a secure location outside your bot host. It contains member IDs and server progression data. This is an additional export, not a replacement for PostgreSQL backups.',
          color:'success'})],
        files:[new AttachmentBuilder(zipped,{name:filename})],
      });
    }catch(error){
      return InteractionHelper.safeEditReply(interaction,{content:'❌ Progression export failed. No database records were modified.'});
    }
  },
};
