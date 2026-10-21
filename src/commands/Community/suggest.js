import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Post an idea for your community to vote on')
    .setDMPermission(false)
    .addStringOption(o => o.setName('idea').setDescription('Your suggestion').setRequired(true).setMinLength(1).setMaxLength(1000)),
  category: 'Community',

  async execute(interaction) {
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
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

    const embed = createEmbed({
      title: '💡 Community Suggestion',
      description: idea,
      color: 'primary',
      fields: [
        { name: 'Submitted by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Status', value: '🟡 Under review', inline: true },
      ],
    }).setTimestamp();

    let message;
    try {
      message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      logger.warn('Could not post suggestion', { guildId: interaction.guildId, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, { content: 'I could not post your suggestion here. Check the channel permissions.' });
    }
    const votes = await Promise.allSettled([message.react('👍'), message.react('👎')]);
    const partial = votes.some(v => v.status === 'rejected');

    return InteractionHelper.safeEditReply(interaction, {
      content: `✅ Suggestion posted! ${message.url}`
        + (partial ? '\n⚠️ I could not add all voting reactions. Enable **Add Reactions** and **Read Message History** for Beacon.' : ''),
    });
  },
};
