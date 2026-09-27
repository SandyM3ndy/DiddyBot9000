import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botConfig } from '../../config/bot.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getServerProgression } from '../../services/serverProgressionService.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('giveexp')
    .setDescription('Give Server XP to a server')
    .addStringOption(option =>
      option
        .setName('server_id')
        .setDescription('The Discord server ID to give XP to')
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount of Server XP to give')
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
          description: 'DiddyBot9000 is not currently in that server.',
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

    const data = await getServerProgression(interaction.client, serverId);
    const oldLevel = data.level;
    const oldXp = data.xp;

    data.xp += amount;
    data.level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, data.xp) / 500)) + 1);
    data.updatedAt = new Date().toISOString();

    await interaction.client.db.set(`guild:${serverId}:progression`, data);

    return InteractionHelper.safeReply(interaction, {
      embeds: [createEmbed({
        title: '📈 Server XP Added',
        description: `Successfully gave **+${amount.toLocaleString()} XP** to **${guild.name}**.`,
        color: 'success',
        fields: [
          { name: '🏠 Server', value: `${guild.name} (${serverId})`, inline: false },
          { name: '⭐ XP', value: `${oldXp.toLocaleString()} → **${data.xp.toLocaleString()}**`, inline: true },
          { name: '📊 Level', value: oldLevel !== data.level ? `${oldLevel} → **${data.level}** 🎉` : `${data.level}`, inline: true },
        ],
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
