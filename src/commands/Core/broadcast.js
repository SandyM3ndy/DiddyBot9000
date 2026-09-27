import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send a message through the bot to every server it is in')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('The message to send')
        .setRequired(true),
    ),

  category: 'Core',

  async execute(interaction, config, client) {
    // Only the bot owner can use this command.
    if (interaction.user.id !== client.application.owner?.id) {
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

    for (const guild of client.guilds.cache.values()) {
      let channel = guild.channels.cache.find(
        (channel) =>
          channel.isTextBased() &&
          channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages),
      );

      if (!channel) {
        failed++;
        continue;
      }

      try {
        await channel.send(message);
        sent++;

        // Small delay to avoid hammering Discord's API.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failed++;
      }
    }

    await interaction.editReply({
      content: `📡 **Broadcast complete!**\n\n✅ Sent: **${sent}** servers\n❌ Failed/skipped: **${failed}** servers`,
    });
  },
};
