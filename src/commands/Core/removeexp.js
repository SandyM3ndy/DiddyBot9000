import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

const OWNER_ID = '1022691434974957618';
const PROGRESSION_PREFIX = 'guild:';
const PROGRESSION_SUFFIX = ':progression';

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 500)) + 1);
}

export default {
  data: new SlashCommandBuilder()
    .setName('removeexp')
    .setDescription('Remove Server XP from a server')
    .addStringOption(option =>
      option
        .setName('server_id')
        .setDescription('The Discord server ID to remove XP from')
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount of Server XP to remove')
        .setMinValue(1)
        .setMaxValue(1000000000)
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
    const amount = interaction.options.getInteger('amount', true);

    if (!/^\d{17,20}$/.test(serverId)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ Invalid Server ID',
          description: 'Please provide a valid Discord server ID.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = interaction.client.guilds.cache.get(serverId);
    if (!guild) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ Server Not Found',
          description: 'Beacon is not currently in that server.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const config = await getGuildConfig(interaction.client, serverId);
    if (config?.serverProgression?.enabled !== true) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '📈 Progression Disabled',
          description: `Server Progression is not enabled in **${guild.name}**. Enable it through **/configwizard → Server Progression** first.`,
          color: 'warning',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const key = `${PROGRESSION_PREFIX}${serverId}${PROGRESSION_SUFFIX}`;
    const data = await interaction.client.db.get(key, null);

    if (!data || typeof data !== 'object') {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ No Progression Data',
          description: `**${guild.name}** does not have any saved Server Progression data yet.`,
          color: 'warning',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const oldXp = Math.max(0, Number(data.xp) || 0);
    const oldLevel = Math.max(1, Number(data.level) || levelFromXp(oldXp));
    const newXp = Math.max(0, oldXp - amount);
    const newLevel = levelFromXp(newXp);

    data.xp = newXp;
    data.level = newLevel;
    data.updatedAt = new Date().toISOString();

    await interaction.client.db.set(key, data);

    return InteractionHelper.safeReply(interaction, {
      embeds: [createEmbed({
        title: '📉 Server XP Removed',
        description: `Successfully removed **${(oldXp - newXp).toLocaleString()} XP** from **${guild.name}**.`,
        color: 'success',
        fields: [
          { name: '🏠 Server', value: `${guild.name} (${serverId})`, inline: false },
          { name: '⭐ XP', value: `${oldXp.toLocaleString()} → **${newXp.toLocaleString()}**`, inline: true },
          { name: '📊 Level', value: oldLevel !== newLevel ? `${oldLevel} → **${newLevel}**` : `${newLevel}`, inline: true },
          { name: '🛡️ Access', value: 'Owner-only command', inline: false },
        ],
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
