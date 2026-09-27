js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { isBotOwner } from '../../config/bot.js';

// Server IDs that should NOT receive broadcasts.
const DISABLED_GUILD_IDS = [
  '1533146166965964943',
];

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send a message through the bot to every server it is in')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('The message to broadcast')
        .setRequired(true),
    ),

  category: 'Core',

  async execute(interaction, config, client) {
    // Only configured bot owners can use this command.
    if (!isBotOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Only the bot owner can use this command.',
        ephemeral: true,
      });
    }

    const message = interaction.options.getString('message', true);

    await interaction.reply({
      content: '📡 Starting broadcast...',
      ephemeral: true,
    });

    let sent = 0;
    let failed = 0;
    let disabled = 0;

    for (const guild of client.guilds.cache.values()) {
      // Skip servers that have been manually disabled.
      if (DISABLED_GUILD_IDS.includes(guild.id)) {
        disabled++;
        continue;
      }

      const channel = guild.channels.cache.find(
        (channel) =>
          channel.isTextBased() &&
          channel.permissionsFor(guild.members.me)?.has(
            PermissionFlagsBits.SendMessages,
          ),
      );

      if (!channel) {
        failed++;
        continue;
      }

      try {
        await channel.send(message);
        sent++;

        // Wait between servers to stay friendly with Discord rate limits.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failed++;
      }
    }

    await interaction.editReply({
      content:
        `📡 **Broadcast complete!**\n\n` +
        `✅ Sent: **${sent}** servers\n` +
        `🚫 Disabled: **${disabled}** servers\n` +
        `❌ Failed: **${failed}** servers`,
    });
  },
};

