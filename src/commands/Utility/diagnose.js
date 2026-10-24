import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { diagnoseGuild } from '../../utils/diagnostics.js';

const ICONS = { critical: '🔴', warning: '🟠', unverified: '⚪', ok: '🟢' };

export default {
  data: new SlashCommandBuilder()
    .setName('diagnose')
    .setDescription('Privately check Beacon setup and missing permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Utility',
  async execute(interaction, config = {}, client) {
    if (!interaction.guild) {
      return InteractionHelper.safeReply(interaction, { content: 'Run /diagnose inside a server.', flags: MessageFlags.Ephemeral });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    const member = interaction.guild.members.me
      || await interaction.guild.members.fetchMe().catch(() => null);
    const findings = diagnoseGuild(interaction.guild, config || {}, member);

    const databaseStatus = client.db?.getStatus?.();
    if (!databaseStatus || databaseStatus.isDegraded === true || databaseStatus.connectionType !== 'postgresql') {
      findings.unshift({ severity: 'critical', subject: 'Database', detail: 'Persistent database connectivity is not confirmed healthy.' });
    }
    const count = level => findings.filter(item => item.severity === level).length;
    const critical = count('critical');
    const warning = count('warning');
    const unverified = count('unverified');
    const top = findings.slice(0, 14).map(item => ICONS[item.severity] + ' **' + item.subject + '** — ' + item.detail);
    const truncated = findings.length > top.length ? '\n…and ' + (findings.length - top.length) + ' more findings.' : '';
    const summary = critical + ' critical • ' + warning + ' warnings • ' + unverified + ' unverified';
    const desc = '**' + summary + '**\n\n' + top.join('\n') + truncated +
      '\n\n-# Read-only check; uncached resources are not assumed deleted. Nothing was changed.';
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '🩺 Beacon • Server Diagnostics',
        description: desc.slice(0, 4000),
        color: critical ? 'error' : warning || unverified ? 'warning' : 'success',
        footer: 'Beacon v1.1 • Use /dashboard to repair server settings',
      })],
    });
  },
};
