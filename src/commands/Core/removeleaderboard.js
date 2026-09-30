import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getServerProgression } from '../../services/serverProgressionService.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('removeleaderboard')
    .setDescription('Remove a server from the global Server Progression leaderboard')
    .addStringOption(option => option
      .setName('server_id')
      .setDescription('The Discord server ID to remove from the leaderboard')
      .setRequired(true)),
  category: 'Owner',

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return InteractionHelper.safeReply(interaction, {
        content: '❌ You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const serverId = interaction.options.getString('server_id', true).trim();
    if (!/^\d{17,20}$/.test(serverId)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: '❌ Invalid Server ID', description: 'Please provide a valid Discord server ID.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = interaction.client.guilds.cache.get(serverId);
    if (!guild) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: '❌ Server Not Found', description: 'Beacon is not currently in that server.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const data = await getServerProgression(interaction.client, serverId);
    if (data.leaderboardExcluded === true) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: '🌎 Already Removed', description: `**${guild.name}** is already excluded from the global Server Progression leaderboard.`, color: 'warning' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    data.leaderboardExcluded = true;
    data.updatedAt = new Date().toISOString();
    await interaction.client.db.set(`guild:${serverId}:progression`, data);

    return InteractionHelper.safeReply(interaction, {
      embeds: [createEmbed({
        title: '🌎 Server Removed From Leaderboard',
        description: `**${guild.name}** has been removed from the global Server Progression leaderboard.`,
        color: 'success',
        fields: [
          { name: '🏠 Server', value: `${guild.name} (${serverId})`, inline: false },
          { name: '📈 Server XP', value: data.xp.toLocaleString(), inline: true },
          { name: '📊 Level', value: String(data.level), inline: true },
        ],
        footer: 'The server can still use Server Progression normally; only its global leaderboard listing is hidden.',
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};