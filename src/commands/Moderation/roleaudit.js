import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { auditDangerousRoles } from '../../utils/roleAudit.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roleaudit')
    .setDescription('Privately review powerful server roles and risky permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Moderation',
  async execute(interaction) {
    if (!interaction.guild) {
      return InteractionHelper.safeReply(interaction, { content: 'Use /roleaudit inside your server.', flags: MessageFlags.Ephemeral });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const roles = auditDangerousRoles(interaction.guild.roles.cache.values());
    const critical = roles.filter(item => item.severity === 'critical').length;
    const high = roles.filter(item => item.severity === 'high').length;
    const entries = roles.slice(0, 10).map(item => {
      const icon = item.severity === 'critical' ? '🔴' : item.severity === 'high' ? '🟠' : '🔵';
      const tag = item.managed ? ' • integration-managed' : item.everyone ? ' • @everyone' : '';
      const name = item.name.replace(/[*_~]/g, '');
      return icon + ' **' + name + '**\n> ' + item.permissions.join(', ') + tag;
    });
    const desc = '**' + roles.length + ' roles with powerful permissions**\n' +
      critical + ' Administrator • ' + high + ' high-impact\n\n' +
      (entries.join('\n\n') || '✅ No flagged permissions found.') +
      (roles.length > 10 ? '\n\n…and ' + (roles.length - 10) + ' additional roles. Highest risk first.' : '') +
      '\n\n-# Read-only • No permissions have been modified.';
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '🛡️ Beacon • Role Security Audit',
        description: desc.slice(0, 4000),
        color: critical ? 'error' : high ? 'warning' : 'info',
        footer: 'Beacon v1.1 • Review privileged roles in Discord Server Settings',
      })],
    });
  },
};
