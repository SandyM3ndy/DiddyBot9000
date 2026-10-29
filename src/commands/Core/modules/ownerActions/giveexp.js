import { MessageFlags } from 'discord.js';
import { createEmbed } from '../../../../utils/embeds.js';
import { InteractionHelper } from '../../../../utils/interactionHelper.js';
import { getGuildConfig } from '../../../../services/config/guildConfig.js';
import { addServerXp } from '../../../../services/serverProgressionService.js';

import { isPrimaryBotOwner } from '../../../../config/bot.js';

// Internal action owned by /ownerstats. Not a standalone Discord command.
export default {
  async execute(interaction) {
    if (!isPrimaryBotOwner(interaction.user.id)) {
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

    const result = await addServerXp(interaction.client, serverId, amount);
    if (!result) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ XP Not Added',
          description: 'The XP amount was invalid or could not be saved.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }
    const { data, oldLevel, oldXp } = result;

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
