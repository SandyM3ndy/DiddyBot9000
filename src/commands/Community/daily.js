import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { respondSandDaily } from '../../utils/sandDailyReply.js';
import { logger } from '../../utils/logger.js';

export default {
 slashOnly: true,
 category: 'Community',
 data: new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim global Sand Coins every day; reach day 7 for the maximum reward')
  .setDMPermission(false),
 async execute(interaction) {
  if (!interaction.guild) return InteractionHelper.safeReply(interaction, {
   content: 'Use /daily inside a Beacon server.', flags: MessageFlags.Ephemeral,
  });
  if (!(await InteractionHelper.safeDefer(interaction))) return;
  try {
   return await respondSandDaily(interaction);
  } catch (error) {
   logger.error('Daily Sand Coins claim failed', { userId: interaction.user.id, error: error.message });
   return InteractionHelper.safeEditReply(interaction, {
    content: '⚠️ The daily reward could not be confirmed. No extra Sand Coins were issued. Please try again.',
   });
  }
 },
};
