import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildRpsChoicePayload } from '../../services/funGamesService.js';

export default {
  slashOnly:true,
  category:'Fun',
  data:new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Challenge Beacon to Rock, Paper, Scissors')
    .addBooleanOption(option=>option.setName('private')
      .setDescription('Play privately (default: public)')),
  async execute(interaction){
    const privateReply=interaction.options.getBoolean('private')===true;
    return InteractionHelper.safeReply(interaction,{
      ...buildRpsChoicePayload(interaction.user.id),
      ...(privateReply?{flags:MessageFlags.Ephemeral}:{}),
    });
  },
};
