import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { renderSuggestionPost, createSuggestionRecord } from '../../services/suggestionReviewService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Post an idea for your community to vote on')
    .setDMPermission(false)
    .addStringOption(o => o.setName('idea').setDescription('Your suggestion').setRequired(true).setMinLength(1).setMaxLength(1000)),
  category: 'Community',

  async execute(interaction) {
    if (!(await InteractionHelper.safeDefer(interaction))) return;
    const idea = interaction.options.getString('idea', true).trim();
    if (!idea) {
      return InteractionHelper.safeEditReply(interaction, { content: 'Your suggestion cannot be empty.' });
    }

    const channel = interaction.channel;
    if (!interaction.guildId || !channel?.send) {
      return InteractionHelper.safeEditReply(interaction, { content: 'Use this command in a server text channel.' });
    }
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    if (!me || !channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Beacon needs **Send Messages** and **Embed Links** in this channel.',
      });
    }

    const state = {
      id:interaction.id,guildId:interaction.guildId,channelId:interaction.channelId,
      authorId:interaction.user.id,idea,status:'under_review',reviewedBy:null,
      createdAt:new Date().toISOString(),messageId:null,
    };
    try {
      // Do not promise a reviewable suggestion unless its state was first
      // committed to persistent storage. No TTL and no collector dependency.
      await createSuggestionRecord(interaction.client,state);
      // The slash response is the public suggestion, not a private receipt
      // followed by a duplicate channel message.
      const posted = await InteractionHelper.safeEditReply(interaction, {
        ...renderSuggestionPost(state),
      });
      if (!posted) return;
      const message = await interaction.fetchReply();
      const votes = await Promise.allSettled([message.react('👍'), message.react('👎')]);
      if (votes.some(v => v.status === 'rejected')) {
        await interaction.followUp({
          content: '⚠️ Suggestion posted, but voting reactions are unavailable. Check Add Reactions and Read Message History permissions.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    } catch (error) {
      logger.warn('Could not complete suggestion', { guildId: interaction.guildId, error: error?.message });
      // A refused database write must never look like a successfully saved suggestion.
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: '⚠️ Could not complete the suggestion. Check channel permissions.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  },
};
