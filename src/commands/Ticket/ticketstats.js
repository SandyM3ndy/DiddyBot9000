import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { getGuildTicketStats } from '../../utils/database/tickets.js';

export function formatTicketCloseTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'Not enough data';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'Under 1 min';
  if (minutes < 60) return String(minutes) + ' min';
  return Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm';
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticketstats')
    .setDescription('Show private ticket activity and resolution statistics')
    .setDMPermission(false),
  category: 'Ticket',
  async execute(interaction, guildConfig = {}, client) {
    if (!interaction.guildId) {
      return InteractionHelper.safeReply(interaction, { content: 'Run this inside a server.', flags: MessageFlags.Ephemeral });
    }
    const roleId = guildConfig?.ticketStaffRoleId;
    const roles = interaction.member?.roles;
    const isStaff = Boolean(roleId && (roles?.cache?.has?.(roleId) || (Array.isArray(roles) && roles.includes(roleId))));
    const allowed = interaction.guild?.ownerId === interaction.user.id ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageChannels) || isStaff;
    if (!allowed) {
      return InteractionHelper.safeReply(interaction, {
        content: '🔒 Ticket statistics are restricted to server managers and the ticket support team.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const dbStatus = client.db?.getStatus?.();
    if (!dbStatus?.initialized || dbStatus.isDegraded) {
      return InteractionHelper.safeEditReply(interaction, { content: '⚠️ Ticket statistics are unavailable while the database is unhealthy.' });
    }
    try {
      const stats = await getGuildTicketStats(interaction.guildId, { strict: true });
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: '🎫 Beacon • Ticket Statistics',
          description: 'Private support summary for this server. No transcripts or ticket contents are shown.',
          color: 'info',
          fields: [
            { name: '🟢 Open', value: String(stats.openCount), inline: true },
            { name: '✅ Closed', value: String(stats.closedCount), inline: true },
            { name: '📊 Total', value: String(stats.openCount + stats.closedCount), inline: true },
            { name: '⏱️ Avg. Resolution', value: formatTicketCloseTime(stats.avgCloseTimeMs), inline: true },
            { name: '🤝 Claimed Tickets', value: String(stats.claimedCount), inline: true },
            { name: '⌛ Open & Unclaimed', value: String(stats.unclaimedOpenCount), inline: true },
            { name: '⏱️ Avg. Claim Time', value: formatTicketCloseTime(stats.avgClaimTimeMs), inline: true },
            { name: '⭐ Feedback', value: stats.feedbackCount > 0 ?
              String(stats.avgRating) + '/5 (' + stats.feedbackCount + ' ratings)' : 'No feedback yet', inline: true },
          ],
          footer: 'Beacon • Private support metrics • Claim time is not first response time',
        })],
      });
    } catch {
      return InteractionHelper.safeEditReply(interaction, { content: '⚠️ Could not retrieve reliable ticket statistics. Try again after checking /status.' });
    }
  },
};
