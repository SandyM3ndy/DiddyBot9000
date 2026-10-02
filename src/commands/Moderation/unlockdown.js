import { SlashCommandBuilder } from 'discord.js';
import { warningEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isLockdownActive, restoreLockdown } from '../../services/lockdownService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unlockdown')
    .setDescription('Restore the server after an emergency lockdown.')
  ,category: 'moderation',

  async execute(interaction, config, client) {
    if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Owner Only', 'Only the server owner can use /unlockdown.')],
        ephemeral: true,
      });
    }

    if (!isLockdownActive(client, interaction.guild.id)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Not Locked Down', 'This server is not currently in lockdown.')],
        ephemeral: true,
      });
    }

    const result = await restoreLockdown(client, interaction.guild);

    if (!result.success) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Unlockdown Failed', 'The lockdown state could not be restored.')],
        ephemeral: true,
      });
    }

    return InteractionHelper.safeReply(interaction, {
      embeds: [successEmbed('🟢 LOCKDOWN LIFTED', 'The server has been restored to its pre-lockdown permission state.')],
      ephemeral: true,
    });
  },
};
