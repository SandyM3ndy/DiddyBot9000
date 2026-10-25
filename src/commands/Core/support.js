import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { BEACON_TEAM_NAME, BEACON_MOTTO, BEACON_TEAM_THANKS } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const SUPPORT_SERVER_URL = "https://discord.gg/76N2EM6v6k";

export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get help, report an issue, suggest an idea, or ask a question"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Join Support Server")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({
            title: "💜 Beacon • Here for Your Community",
            description: '**' + BEACON_MOTTO + '**\n\nNeed a hand? Join our support server to report a bug, suggest an improvement or get help with your server setup.\n\n' + BEACON_TEAM_THANKS + '\n\nWith appreciation, **' + BEACON_TEAM_NAME + '** 💜',
          }),
        ],
        components: [actionRow],
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'System Error', description: 'Could not display support information.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};
