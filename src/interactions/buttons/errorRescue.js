import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorRescueEmbed } from '../../utils/errorRescue.js';

export default {
  name:'error_rescue',
  async execute(interaction,_client,args=[]){
    const [type,reference]=args;
    return InteractionHelper.safeReply(interaction,{
      embeds:[errorRescueEmbed(type,reference)],
      flags:MessageFlags.Ephemeral,
    });
  },
};
