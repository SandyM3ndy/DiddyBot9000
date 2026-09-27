import { createEmbed, warningEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { activateLockdown, verifyLockdownConfirmation } from '../../../services/lockdownService.js';

export default {
  name: 'lockdown_confirmation',
  async execute(interaction, client, args) {
    const [userId] = args;

    if (!interaction.guild || interaction.user.id !== userId || interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'This lockdown confirmation is not valid for you.', ephemeral: true });
    }

    const confirmation = interaction.fields.getTextInputValue('confirmation_username').trim();

    if (!verifyLockdownConfirmation(confirmation)) {
      return interaction.reply({
        embeds: [warningEmbed('Lockdown Cancelled', 'The confirmation username was incorrect. No changes were made.')],
        ephemeral: true,
      });
    }

    await interaction.reply({
      embeds: [warningEmbed('🔴 LOCKDOWN', 'Emergency lockdown is being activated now.')],
      ephemeral: true,
    });

    const alertChannel = interaction.channel;
    if (alertChannel?.isTextBased?.()) {
      await alertChannel.send({
        embeds: [createEmbed({
          title: '🔴 LOCKDOWN',
          description: 'Emergency server lockdown activated by the server owner. Server activity is being restricted.',
          color: 'error',
        })],
      }).catch((error) => logger.warn(`Could not send lockdown alert in ${interaction.guild.name}: ${error.message}`));
    }

    try {
      const result = await activateLockdown(client, interaction.guild);
      await interaction.editReply({
        embeds: [successEmbed(
          '🔒 LOCKDOWN ACTIVE',
          `Server locked down. Channels locked: ${result.channelsLocked}. Roles restricted: ${result.rolesLocked}. Active invites revoked: ${result.invitesRevoked}.`,
        )],
      });
    } catch (error) {
      logger.error(`Lockdown activation failed in ${interaction.guild.name}:`, error);
      await interaction.editReply({
        embeds: [warningEmbed('Lockdown Failed', 'The lockdown could not be completed. Check the bot permissions and role hierarchy.')],
      }).catch(() => {});
    }
  },
};
