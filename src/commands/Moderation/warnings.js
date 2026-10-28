import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildWarningsView } from '../../utils/moderation/warningDisplay.js';
import warnCommand from './warn.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Privately review and manage a member’s warnings')
    .setDMPermission(false)
    .addSubcommand(sub => sub.setName('list').setDescription('Review a member warning history')
      .addUserOption(o => o.setName('target').setDescription('Member to check').setRequired(true)))
    .addSubcommand(sub => sub.setName('add').setDescription('Issue a moderation warning')
      .addUserOption(o => o.setName('target').setDescription('Member to warn').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(500)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  category: 'Moderation',
  async execute(interaction, config, client) {
    if (['add','warn'].includes(interaction.options.getSubcommand())) return warnCommand.execute(interaction, config, client);
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const target = interaction.options.getUser('target', true);
    try {
      const records = await WarningService.getWarnings(interaction.guildId, target.id);
      await InteractionHelper.safeEditReply(interaction, buildWarningsView({
        warnings: records, target, viewerId: interaction.user.id,
      }));

      // Audit AFTER the UI is shown so slow logging cannot block a moderator.
      await logEvent({
        client: client || interaction.client, guild: interaction.guild,
        event: {
          action: 'Warnings Viewed',
          target: `${target.tag} (${target.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Viewed ${records.length} warnings`,
          metadata: { userId: target.id, moderatorId: interaction.user.id, totalWarnings: records.length },
        },
      });
    } catch (error) {
      logger.warn('Failed to display warnings', { guildId: interaction.guildId, error: error?.message });
      await InteractionHelper.safeEditReply(interaction, {
        content: 'Could not load warning records. Check the database connection and retry.',
        embeds: [], components: [],
      });
    }
  },
};
