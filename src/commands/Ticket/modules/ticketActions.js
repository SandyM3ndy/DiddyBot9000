import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getTicketData, listTicketsForUser, listOpenSupportQueue } from '../../../utils/database/tickets.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { reopenTicket, unclaimTicket } from '../../../services/ticket.js';

const privateReply = (interaction, content) =>
  InteractionHelper.safeReply(interaction, { content, flags: MessageFlags.Ephemeral });

function hasStaffAccess(ctx, interaction) {
  return Boolean(ctx.hasManageChannels || ctx.hasTicketStaffRole ||
    interaction.guild?.ownerId === interaction.user?.id);
}
function formatTimestamp(date) {
  const value = new Date(date).getTime();
  return Number.isFinite(value) ? '<t:' + Math.floor(value / 1000) + ':R>' : 'Unknown';
}
function clean(value, max = 200) {
  return String(value || 'Unspecified').replaceAll('@', '@\u200b').slice(0,max);
}

export async function showMyTickets(interaction) {
  if (!interaction.guildId) return privateReply(interaction, 'Run this command in a server.');
  if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
  try {
    const tickets = await listTicketsForUser(interaction.guildId, interaction.user.id);
    const shown = tickets.slice(0, 10);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '🎟️ My Support Tickets',
        description: tickets.length
          ? '**' + tickets.length + ' ticket(s)** found. Only you can see this overview.'
          : 'No tickets yet. Visit the support panel to create one.',
        color: 'primary',
        fields: shown.map(t => ({
          name: (t.status === 'open' ? '🟢 ' : t.status === 'archived' ? '📦 ' : '🔒 ') +
            (t.ticketNumber ? 'Ticket #' + t.ticketNumber : 'Support ticket'),
          value: '**Channel:** ' + (t.status === 'archived' ? 'Archived • transcript held privately by support staff' : '<#' + t.id + '>') + '\n**Priority:** ' + clean(t.priority || 'none', 25) +
            '\n**Assigned to:** ' + (t.claimedBy ? '<@' + t.claimedBy + '>' : 'Awaiting staff') +
            '\n**Created:** ' + formatTimestamp(t.createdAt),
          inline: false,
        })),
        footer: tickets.length > 10 ? 'Showing your newest 10 tickets • Use the support panel for new requests' : 'Beacon • Private ticket history',
      })],
    });
  } catch {
    return InteractionHelper.safeEditReply(interaction, { content: '⚠️ Ticket history is unavailable. Please try again when the database is online.' });
  }
}

export async function showTicketQueue(interaction, _config, client) {
  if (!interaction.guildId) return privateReply(interaction, 'Run this command in a server.');
  if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
  try {
    const ctx = await getTicketPermissionContext({ client: client || interaction.client, interaction });
    // The queue is accessible outside ticket channels to authorized staff; a ticket record is not required.
    if (!hasStaffAccess(ctx, interaction) && !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeEditReply(interaction, { content: '🔒 Only ticket staff and server managers can view the queue.' });
    }
    const queue = await listOpenSupportQueue(interaction.guildId);
    const open = queue.filter(t => !t.claimedBy);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '📥 Beacon • Support Queue',
        description: '**' + queue.length + ' open** • **' + open.length + ' unclaimed**\nTickets appear in priority order, then oldest first.',
        color: open.some(t => t.priority === 'urgent') ? 'warning' : 'primary',
        fields: queue.slice(0, 12).map(t => ({
          name: (t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🔹') +
            ' ' + (t.ticketNumber ? '#' + t.ticketNumber : 'Ticket') +
            ' • ' + String(t.priority || 'normal').toUpperCase(),
          value: '<#' + t.id + '> • ' + (t.claimedBy ? 'Claimed by <@' + t.claimedBy + '>' : '**Unclaimed**') +
            '\nOpened ' + formatTimestamp(t.createdAt),
          inline: false,
        })),
        footer: 'Beacon • Private staff queue • ' + (queue.length > 12 ? 'Showing first 12 tickets' : 'All open tickets shown'),
      })],
    });
  } catch {
    return InteractionHelper.safeEditReply(interaction, { content: '⚠️ Support queue is unavailable. Check /status and retry.' });
  }
}

export async function showTicketInfo(interaction, _config, client) {
  if (!interaction.guildId) return privateReply(interaction, 'Use this inside a support ticket.');
  if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
  try {
    const ctx = await getTicketPermissionContext({ client: client || interaction.client, interaction });
    const ticket = ctx.ticketData;
    if (!ticket) return InteractionHelper.safeEditReply(interaction, { content: 'This channel is not a Beacon ticket.' });
    if (!ctx.isTicketCreator && !hasStaffAccess(ctx, interaction)) {
      return InteractionHelper.safeEditReply(interaction, { content: 'You do not have access to this ticket information.' });
    }
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '🎫 Ticket Details • ' + (ticket.ticketNumber ? '#' + ticket.ticketNumber : 'Support'),
        description: clean(ticket.reason, 900),
        color: ticket.status === 'open' ? 'success' : 'warning',
        fields: [
          { name: 'Status', value: ticket.status === 'open' ? '🟢 Open' : '🔒 Closed', inline: true },
          { name: 'Priority', value: clean(ticket.priority || 'none', 25), inline: true },
          { name: 'Type', value: clean(ticket.type || 'support', 25), inline: true },
          { name: 'Requester', value: '<@' + ticket.userId + '>', inline: true },
          { name: 'Assigned Staff', value: ticket.claimedBy ? '<@' + ticket.claimedBy + '>' : 'Unclaimed', inline: true },
          { name: 'Created', value: formatTimestamp(ticket.createdAt), inline: true },
        ],
        footer: 'Beacon • Private support information',
      })],
    });
  } catch {
    return InteractionHelper.safeEditReply(interaction, { content: '⚠️ Could not retrieve ticket details.' });
  }
}

export async function reopenTicketAction(interaction, _config, client) {
  if (!interaction.guildId) return privateReply(interaction, 'Use this inside a closed ticket.');
  if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
  try {
    const ctx = await getTicketPermissionContext({ client: client || interaction.client, interaction });
    if (!ctx.canReopenTicket) return InteractionHelper.safeEditReply(interaction, { content: 'Only support staff can reopen a closed ticket.' });
    const result = await reopenTicket(interaction.channel, interaction.user);
    return InteractionHelper.safeEditReply(interaction, { content: result.openCategoryMoveFailed
      ? '✅ Ticket reopened. Note: could not restore the open-ticket category.'
      : '✅ Ticket reopened and available for staff review.' });
  } catch (error) {
    return InteractionHelper.safeEditReply(interaction, { content: '⚠️ ' + (error.userMessage || 'Could not reopen this ticket.') });
  }
}

export async function unclaimTicketAction(interaction, _config, client) {
  if (!interaction.guildId) return privateReply(interaction, 'Use this inside an open ticket.');
  if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
  try {
    const ctx = await getTicketPermissionContext({ client: client || interaction.client, interaction });
    if (!ctx.canManageTicket) return InteractionHelper.safeEditReply(interaction, { content: 'Only ticket staff can release an assignment.' });
    await unclaimTicket(interaction.channel, interaction.member);
    return InteractionHelper.safeEditReply(interaction, { content: '✅ Ticket assignment released. It is back in the unclaimed queue.' });
  } catch (error) {
    return InteractionHelper.safeEditReply(interaction, { content: '⚠️ ' + (error.userMessage || 'Unable to release ticket.') });
  }
}
