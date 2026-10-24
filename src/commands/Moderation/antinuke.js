import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  ANTINUKE_LEVELS,
  getAntiNukeConfig,
  getThreshold,
  setAntiNukeConfig,
  loadPersistedAntiNukeConfig,
  savePersistedAntiNukeConfig,
} from '../../services/antinukeService.js';
import { isAntiNukeAIConfigured, getAntiNukeAIModel } from '../../services/aiSecurityService.js';

export function buildStatusEmbed(config) {
  const enabled = Boolean(config.enabled);
  const limit = getThreshold(config.level);
  return new EmbedBuilder()
    .setColor(getColor(enabled ? 'success' : 'warning'))
    .setTitle('🛡️ Beacon • Security Control Center')
    .setDescription(
      (enabled ? '**🟢 Anti-Nuke protection is online.**' : '**🟠 Anti-Nuke is disabled.**') +
      '\nReview protection sensitivity and detected threats below.\n\n' +
      '**Quick controls**\n' +
      '• /antinuke enable or /antinuke disable\n' +
      '• /antinuke level to adjust sensitivity\n' +
      '• /roleaudit to review dangerous role permissions'
    )
    .addFields(
      { name: '🔒 Protection', value: enabled ? 'Active' : 'Off', inline: true },
      { name: '🎚️ Sensitivity', value: String(config.level || 'medium').toUpperCase(), inline: true },
      { name: '⚡ Detection Limit', value: String(limit) + ' actions / 10 seconds', inline: true },
      { name: '🚨 Threats Detected', value: String(config.threats || 0), inline: true },
      { name: '🛑 Blocked Actions', value: String(config.blockedActions || 0), inline: true },
      { name: '🧠 Detection Engine', value: isAntiNukeAIConfigured()
        ? 'AI assisted • ' + getAntiNukeAIModel() : 'Local adaptive analysis', inline: true },
      { name: '📅 Last Incident', value: config.lastIncident
        ? '<t:' + Math.floor(config.lastIncident / 1000) + ':R>' : 'No incidents recorded', inline: false },
    )
    .setFooter({ text: 'Beacon • Security Center • Private to server managers' })
    .setTimestamp();
}

export default {
  cooldown: 0,
  category: 'Moderation',
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Configure Beacon Anti-Nuke protection')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(o => o.setName('enable').setDescription('Enable Anti-Nuke protection'))
    .addSubcommand(o => o.setName('disable').setDescription('Disable Anti-Nuke protection'))
    .addSubcommand(o => o.setName('status').setDescription('View Anti-Nuke status and security statistics'))
    .addSubcommand(o => o.setName('level')
      .setDescription('Set Anti-Nuke sensitivity and action thresholds')
      .addStringOption(opt => opt.setName('level')
        .setDescription('Protection level')
        .setRequired(true)
        .addChoices(
          { name: 'Low', value: ANTINUKE_LEVELS.LOW },
          { name: 'Medium', value: ANTINUKE_LEVELS.MEDIUM },
          { name: 'High', value: ANTINUKE_LEVELS.HIGH },
          { name: 'Maximum', value: ANTINUKE_LEVELS.MAXIMUM },
        ))),

  async execute(interaction) {
    if (!interaction.guildId) {
      return InteractionHelper.safeReply(interaction, {
        content: 'Anti-Nuke settings are available only inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const allowed = interaction.guild?.ownerId === interaction.user.id
      || interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)
      || interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
    if (!allowed) {
      return InteractionHelper.safeReply(interaction, {
        content: 'You need **Manage Server** permission to manage Anti-Nuke.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Acknowledge immediately; loading or saving server configuration can be slow.
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    const guildId = interaction.guildId;
    try {
      await loadPersistedAntiNukeConfig(interaction.client, guildId);
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'status') {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [buildStatusEmbed(getAntiNukeConfig(guildId))],
        });
      }

      const previous = { ...getAntiNukeConfig(guildId) };
      let changes;
      let action;
      if (subcommand === 'enable') {
        changes = { enabled: true };
        action = 'enabled';
      } else if (subcommand === 'disable') {
        changes = { enabled: false };
        action = 'disabled';
      } else if (subcommand === 'level') {
        const level = interaction.options.getString('level', true);
        if (!Object.values(ANTINUKE_LEVELS).includes(level)) {
          return InteractionHelper.safeEditReply(interaction, { content: 'Choose a valid Anti-Nuke protection level.' });
        }
        changes = { level };
        action = 'updated';
      } else {
        return InteractionHelper.safeEditReply(interaction, { content: 'Unknown Anti-Nuke action.' });
      }

      setAntiNukeConfig(guildId, changes);
      const saved = await savePersistedAntiNukeConfig(interaction.client, guildId);
      if (!saved) {
        // Do not claim success or keep an unsaved setting active in memory.
        setAntiNukeConfig(guildId, previous);
        logger.warn('Anti-Nuke configuration was not saved', { guildId, subcommand });
        return InteractionHelper.safeEditReply(interaction, {
          content: '❌ The Anti-Nuke setting could not be saved. The previous setting was restored. Please retry.',
        });
      }

      const config = getAntiNukeConfig(guildId);
      const embed = buildStatusEmbed(config).setDescription(
        action === 'updated'
          ? `✅ Anti-Nuke sensitivity updated to **${config.level}**.`
          : `✅ Anti-Nuke protection **${action}**.`,
      );
      return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Anti-Nuke command failed', { guildId, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, {
        content: '❌ Unable to update Anti-Nuke. Check database connectivity and try again.',
      });
    }
  },
};
