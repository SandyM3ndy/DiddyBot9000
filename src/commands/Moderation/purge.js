import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete up to 100 recent messages from this channel')
    .setDMPermission(false)
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Number of recent messages to delete (1–100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: 'moderation',
  abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

  async execute(interaction, config, client) {
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const amount = interaction.options.getInteger('amount');
    const channel = interaction.channel;
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return InteractionHelper.safeEditReply(interaction, { content: 'Choose between 1 and 100 messages.' });
    }
    if (!interaction.guildId || !channel?.messages?.fetch || typeof channel.bulkDelete !== 'function') {
      return InteractionHelper.safeEditReply(interaction, { content: 'Message purging is only supported in server text channels.' });
    }

    const bot = interaction.guild?.members?.me || await interaction.guild?.members?.fetchMe?.().catch(() => null);
    if (!bot || !channel.permissionsFor(bot)?.has([
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ViewChannel,
    ])) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Beacon needs **Manage Messages**, **Read Message History** and **View Channel** here.',
      });
    }

    let deletedCount;
    let skippedCount;
    try {
      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkDelete(fetched, true);
      deletedCount = deleted.size;
      skippedCount = Math.max(0, fetched.size - deletedCount);
    } catch (error) {
      logger.warn('Purge message deletion failed', { guildId: interaction.guildId, channelId: channel.id, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Could not delete those messages. Check my permissions. Discord cannot bulk-delete messages older than 14 days.',
      });
    }

    try {
      await logEvent({
        client: client || interaction.client,
        guild: interaction.guild,
        event: {
          action: 'Messages Purged',
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Deleted ${deletedCount} messages`,
          metadata: { channelId: channel.id, messageCount: deletedCount, requestedAmount: amount, skippedCount, moderatorId: interaction.user.id },
        },
      });
    } catch (error) {
      // A logging outage must not turn an already-successful deletion into a reported failure.
      logger.warn('Purge succeeded but moderation logging failed', { channelId: channel.id, error: error?.message });
    }

    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('🧹 Messages Purged',
        `Deleted **${deletedCount}** message(s) in ${channel}.`
        + (skippedCount ? `\n⚠️ **${skippedCount}** message(s) could not be bulk-deleted (possibly older than 14 days).` : '')
        + '\n\nOnly you can see this confirmation.')],
    });
  },
};
