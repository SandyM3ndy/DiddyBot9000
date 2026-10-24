import { PermissionFlagsBits,MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { openReactionRoleDashboard } from '../../../commands/Reaction_roles/reactroles.js';

export default {
  name:'rr_studio_edit',
  async execute(interaction,_client,args=[]){
    if(!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)){
      return InteractionHelper.safeReply(interaction,{
        content:'🔒 Server administrator permission is required to edit reaction-role panels.',
        flags:MessageFlags.Ephemeral,
      });
    }
    const id=args[0];
    if(!/^\d{17,20}$/.test(String(id)))return InteractionHelper.safeReply(interaction,{
      content:'⚠️ Select an existing panel before editing.',
      flags:MessageFlags.Ephemeral,
    });
    return openReactionRoleDashboard(interaction,id);
  },
};
