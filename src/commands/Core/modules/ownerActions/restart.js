import { MessageFlags } from 'discord.js';
import { performScheduledRestart } from '../../../../services/systemHealthService.js';
import { isPrimaryBotOwner } from '../../../../config/bot.js';

// Private confirmed owner action. Not a slash command.
export default {
  async execute(interaction) {
    if (!isPrimaryBotOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Only the bot owner can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const client = interaction.client;
    if (client.restarting || client.isShuttingDown) {
      return interaction.reply({
        content: '⏳ Beacon is already preparing to restart or shutting down.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({
      content: '⚙️ **Beacon is preparing a restart.**\n\nThe status will change to **Doing a Scheduled Restart ⚙️** for 20 seconds, then Beacon will shut down gracefully and the watchdog will check that it comes back online.',
      flags: MessageFlags.Ephemeral,
    });

    const result = await performScheduledRestart(client, { manual: true });
    if (!result.started && result.reason !== 'already_restarting') {
      await interaction.followUp({
        content: '❌ The restart could not be started. Beacon has restored its normal status; check the Railway logs for details.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};
