import { SlashCommandBuilder } from 'discord.js';
import { performScheduledRestart } from '../../services/systemHealthService.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart Beacon (bot owner only)'),

  category: 'Core',

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '❌ Only the bot owner can use this command.',
        ephemeral: true,
      });
    }

    const client = interaction.client;
    if (client.restarting || client.isShuttingDown) {
      return interaction.reply({
        content: '⏳ Beacon is already preparing to restart or shutting down.',
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: '⚙️ **Beacon is preparing a restart.**\n\nThe status will change to **Doing a Scheduled Restart ⚙️** for 20 seconds, then Beacon will shut down gracefully and the watchdog will check that it comes back online.',
      ephemeral: true,
    });

    const result = await performScheduledRestart(client, { manual: true });
    if (!result.started && result.reason !== 'already_restarting') {
      await interaction.followUp({
        content: '❌ The restart could not be started. Beacon has restored its normal status; check the Railway logs for details.',
        ephemeral: true,
      }).catch(() => {});
    }
  },
};
