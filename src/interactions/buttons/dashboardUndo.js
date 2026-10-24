import { PermissionFlagsBits,MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { undoLastDashboardSetting } from '../../services/dashboardExperienceService.js';
import { createEmbed } from '../../utils/embeds.js';

export default [
 {
  name:'dashboard_undo_confirm',
  async execute(interaction,client,args=[]){
   if(!interaction.guild || args[0]!==interaction.guildId ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){
    return InteractionHelper.safeReply(interaction,{
     content:'🔒 Manage Server permission is required to restore settings.',
     flags:MessageFlags.Ephemeral,
    });
   }
   // This confirmation only exists on a private ephemeral prompt.
   // Acknowledge and replace that prompt so the action cannot be clicked twice.
   if(!interaction.deferred&&!interaction.replied){
    try{await interaction.deferUpdate();}catch{return;}
   }
   try{
    const result=await undoLastDashboardSetting(client,interaction.guildId,interaction.user.id,{
     isOwner:interaction.guild.ownerId===interaction.user.id,
    });
    return InteractionHelper.safeEditReply(interaction,{
     embeds:[createEmbed({
      title:result.ok?'✅ Setting Restored':'⚠️ Undo Not Applied',
      description:result.ok
       ?'Restored **'+result.key+'** to the previous saved value. Use /dashboard to refresh the panel.'
       :String(result.reason||'The saved change could not be restored.'),
      color:result.ok?'success':'warning',
      footer:'Beacon • Guarded Dashboard Undo',
     })],
     components:[],
    });
   }catch{
    return InteractionHelper.safeEditReply(interaction,{
     content:'❌ The restore could not be saved. No successful undo was confirmed. Check Beacon storage.',
     components:[],
    });
   }
  },
 },
 {
  name:'dashboard_undo_cancel',
  async execute(interaction){
   if(!interaction.deferred&&!interaction.replied)
     return interaction.update({content:'Undo cancelled. No settings were changed.',embeds:[],components:[]});
  },
 },
];
