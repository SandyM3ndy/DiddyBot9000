// Shared ticket authorisation for slash commands and button workflows.
import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getTicketData } from '../database.js';

export async function getTicketPermissionContext({ client, interaction }) {
  if (!interaction.guildId || !interaction.channelId) {
    return {
      config: {}, ticketData: null, hasManageChannels: false,
      hasTicketStaffRole: false, isTicketCreator: false,
      canManageTicket: false, canCloseTicket: false,
      canReopenTicket: false, canDeleteTicket: false,
    };
  }

  const [config, ticketData] = await Promise.all([
    getGuildConfig(client, interaction.guildId),
    getTicketData(interaction.guildId, interaction.channelId),
  ]);
  const hasManageChannels = Boolean(
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageChannels)
    || interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageChannels)
  );
  const staffRoleId = config?.ticketStaffRoleId || null;
  const memberRoles = interaction.member?.roles;
  const hasTicketStaffRole = Boolean(staffRoleId && (
    memberRoles?.cache?.has?.(staffRoleId)
    || (Array.isArray(memberRoles) && memberRoles.includes(staffRoleId))
  ));
  const isTicketCreator = Boolean(ticketData?.userId && String(ticketData.userId) === String(interaction.user.id));
  const isOpen = Boolean(ticketData && ticketData.status === 'open');
  const isClosed = Boolean(ticketData && ticketData.status === 'closed');
  const isGuildOwner = Boolean(interaction.guild?.ownerId === interaction.user?.id);
  const isStaff = Boolean(hasManageChannels || hasTicketStaffRole || isGuildOwner);

  return {
    config: config || {}, ticketData,
    hasManageChannels, hasTicketStaffRole, isTicketCreator,
    canManageTicket: Boolean(isOpen && isStaff),
    canCloseTicket: Boolean(isOpen && (isStaff || isTicketCreator)),
    canReopenTicket: Boolean(isClosed && isStaff),
    canDeleteTicket: Boolean(isClosed && (hasManageChannels || isGuildOwner)),
  };
}
