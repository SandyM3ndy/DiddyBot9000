import { PermissionFlagsBits,MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getAllReactionRoleMessages } from '../../../services/reactionRoleService.js';
import { buildReactionRoleStudio } from '../../../utils/reactionRoles/reactionRoleStudio.js';

export default {
 name:'rr_studio_select',
 async execute(interaction,client,args=[]){
  if(interaction.guildId!==args[0] ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)){
    return InteractionHelper.safeReply(interaction,{
      content:'🔒 Administrators only.',
      flags:MessageFlags.Ephemeral,
    });
  }
  if(!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
  try{
   const panels=await getAllReactionRoleMessages(client,interaction.guildId);
   return InteractionHelper.safeEditReply(interaction,
     buildReactionRoleStudio(interaction.guild,panels,interaction.values?.[0]));
  }catch{
   return InteractionHelper.safeEditReply(interaction,{
    content:'⚠️ Could not read your panel preview. Saved roles were not modified.',
   });
  }
 },
};
