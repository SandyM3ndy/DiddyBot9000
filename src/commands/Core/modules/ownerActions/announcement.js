import { MessageFlags } from 'discord.js';
import { createEmbed } from '../../../../utils/embeds.js';
import { InteractionHelper } from '../../../../utils/interactionHelper.js';
import { getGuildConfig } from '../../../../services/config/guildConfig.js';
import { logger } from '../../../../utils/logger.js';

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

    const title = interaction.options.getString('title', true).trim();
    const message = interaction.options.getString('message', true).trim();

    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    if (!title || !message) return InteractionHelper.safeEditReply(interaction, { content: 'Title and message cannot be empty.' });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const config = await getGuildConfig(interaction.client, guild.id);
        const channelId = config?.updates?.channelId;

        if (!channelId) {
          skipped++;
          continue;
        }

        const channel = guild.channels.cache.get(channelId)
          ?? await guild.channels.fetch(channelId).catch(() => null);

        if (!channel?.isTextBased()) {
          failed++;
          continue;
        }

        await channel.send({
          content: `📢 **${title}**

${message}`,
          allowedMentions: { parse: [] },
        });

        sent++;
      } catch (error) {
        failed++;
        logger.warn('Announcement delivery failed', { guildId: guild.id, error: error?.message });
      }
    }

    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '📢 Update Broadcast Complete',
        description: `Updates delivered to configured channels.\n\n✅ **Sent:** ${sent}\n🔕 **Not configured:** ${skipped}\n❌ **Failed:** ${failed}`,
        color: failed > 0 ? 'warning' : 'success',
        footer: 'Only configured update channels receive announcements.',
      })],
    });
  },
};
