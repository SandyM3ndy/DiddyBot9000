import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getServerProgression } from '../../services/serverProgressionService.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder().setName('restoreleaderboard').setDescription('Restore a server to the global progression leaderboard').addStringOption(option => option.setName('server_id').setDescription('The Discord server ID').setRequired(true)),
  category: 'Core',
  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '🔒 Owner Only', description: 'Only the bot owner can use this command.', color: 'error' })], flags: MessageFlags.Ephemeral });
    const serverId = interaction.options.getString('server_id', true).trim();
    if (!/^\d{17,20}$/.test(serverId)) return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '❌ Invalid Server ID', description: 'Please provide a valid Discord server ID.', color: 'error' })], flags: MessageFlags.Ephemeral });
    const guild = interaction.client.guilds.cache.get(serverId);
    if (!guild) return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '❌ Server Not Found', description: 'Beacon is not currently in that server.', color: 'error' })], flags: MessageFlags.Ephemeral });
    const data = await getServerProgression(interaction.client, serverId);
    if (data.leaderboardExcluded !== true) return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: 'ℹ️ Already on Leaderboard', description: `**${guild.name}** is already included in the global progression leaderboard.`, color: 'info' })], flags: MessageFlags.Ephemeral });
    data.leaderboardExcluded = false;
    data.updatedAt = new Date().toISOString();
    await interaction.client.db.set(`guild:${serverId}:progression`, data);
    return InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: '✅ Server Restored', description: `**${guild.name}** has been restored to the global progression leaderboard.`, color: 'success', fields: [{ name: 'Server ID', value: serverId, inline: true }, { name: 'Level', value: String(data.level), inline: true }, { name: 'Server XP', value: data.xp.toLocaleString(), inline: true }] })], flags: MessageFlags.Ephemeral });
  },
};