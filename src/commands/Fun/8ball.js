import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { build8BallPayload } from '../../services/funGamesService.js';

export default {
  slashOnly:true,
  category:'Fun',
  data:new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask Beacon’s magic 8-ball a question — just for fun')
    .addStringOption(option=>option.setName('question')
      .setDescription('What would you like to ask the magic 8-ball?')
      .setMinLength(2).setMaxLength(180).setRequired(true))
    .addBooleanOption(option=>option.setName('private')
      .setDescription('Show this prediction only to you (default: public)')),
  async execute(interaction){
    const question=interaction.options.getString('question');
    const privateReply=interaction.options.getBoolean('private')===true;
    return InteractionHelper.safeReply(interaction,{
      ...build8BallPayload(question,interaction.user.id),
      ...(privateReply?{flags:MessageFlags.Ephemeral}:{}),
    });
  },
};
