import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

import {
  ANTINUKE_LEVELS,
  getAntiNukeConfig,
  setAntiNukeConfig,
  loadPersistedAntiNukeConfig,
  savePersistedAntiNukeConfig,
} from '../../services/antinukeService.js';
import { isAntiNukeAIConfigured, getAntiNukeAIModel } from '../../services/aiSecurityService.js';

export default {
  cooldown: 0,

  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Configure DiddyBot Anti-Nuke protection.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Enable Anti-Nuke protection.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable Anti-Nuke protection.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('View the current Anti-Nuke status.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('level')
        .setDescription('Set Anti-Nuke level. Low: 8, Medium: 5, High: 3, Maximum: 2 actions in 10 seconds.')
        .addStringOption((option) =>
          option
            .setName('level')
            .setDescription('Protection level.')
            .setRequired(true)
            .addChoices(
              { name: 'Low', value: ANTINUKE_LEVELS.LOW },
              { name: 'Medium', value: ANTINUKE_LEVELS.MEDIUM },
              { name: 'High', value: ANTINUKE_LEVELS.HIGH },
              { name: 'Maximum', value: ANTINUKE_LEVELS.MAXIMUM }
            )
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (!guildId) {
      return interaction.reply({
        content: '❌ This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return interaction.reply({
        content: '❌ You need Administrator permission to use Anti-Nuke.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await loadPersistedAntiNukeConfig(interaction.client, guildId);

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'enable') {
      setAntiNukeConfig(guildId, { enabled: true });
      await savePersistedAntiNukeConfig(interaction.client, guildId);

      const config = getAntiNukeConfig(guildId);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Anti-Nuke Enabled')
            .setDescription(
              `Anti-Nuke protection is now **enabled**.\n\n` +
              `**Protection Level:** ${config.level}\n` +
              `**AI Security:** ${isAntiNukeAIConfigured() ? `Enabled (${getAntiNukeAIModel()})` : 'Adaptive local analysis only — add OPENAI_API_KEY for real AI analysis.'}`
            )
            .setTimestamp(),
        ],
      });
    }

    if (subcommand === 'disable') {
      setAntiNukeConfig(guildId, { enabled: false });
      await savePersistedAntiNukeConfig(interaction.client, guildId);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Anti-Nuke Disabled')
            .setDescription(
              'Anti-Nuke protection has been **disabled**.'
            )
            .setTimestamp(),
        ],
      });
    }

    if (subcommand === 'level') {
      const level = interaction.options.getString('level', true);

      setAntiNukeConfig(guildId, { level });
      await savePersistedAntiNukeConfig(interaction.client, guildId);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Anti-Nuke Level Updated')
            .setDescription(
              `Anti-Nuke protection level is now **${level}**.`
            )
            .setTimestamp(),
        ],
      });
    }

    if (subcommand === 'status') {
      const config = getAntiNukeConfig(guildId);

      const status = config.enabled ? '🟢 Enabled' : '🔴 Disabled';

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Anti-Nuke Status')
            .addFields(
              {
                name: 'Status',
                value: status,
                inline: true,
              },
              {
                name: 'Level',
                value: config.level,
                inline: true,
              },
              {
                name: 'Blocked Actions',
                value: String(config.blockedActions),
                inline: true,
              },
              {
                name: 'Threats',
                value: String(config.threats),
                inline: true,
              },
              {
                name: 'AI Security',
                value: isAntiNukeAIConfigured() ? `🧠 Enabled (${getAntiNukeAIModel()})` : '🧩 Local adaptive analysis',
                inline: true,
              },
              {
                name: 'Last Incident',
                value: config.lastIncident
                  ? `<t:${Math.floor(config.lastIncident / 1000)}:R>`
                  : 'None',
                inline: true,
              }
            )
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
