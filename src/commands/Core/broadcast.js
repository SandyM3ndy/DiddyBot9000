import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';
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
    // Broadcast is restricted to Sandy's Discord account only.
    if (interaction.user.id !== '1022691434974957618') {
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

      const sendableChannels = guild.channels.cache
        .filter(
          (channel) =>
            channel.isTextBased() &&
            channel.permissionsFor(guild.members.me)?.has(
              PermissionFlagsBits.SendMessages,
            ),
        )
        .sort((a, b) => a.position - b.position);

      // Prefer a normal chat/general channel when one exists.
      const channel =
        sendableChannels.find((channel) =>
          /^(general|chat|main|lobby|general-chat|server-chat)$/i.test(channel.name),
        ) ||
        sendableChannels.first();

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

