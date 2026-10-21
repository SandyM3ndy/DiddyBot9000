import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { logger } from '../../utils/logger.js';
import { protectedTicketParticipant } from '../../utils/ticket/ticketCommandHelpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketremove')
    .setDescription('Remove a member from an existing support ticket')
    .setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('Server member').setRequired(true)),
  category: 'Ticket',

  async execute(interaction, config, client) {
    if (!interaction.guildId) {
      return InteractionHelper.safeReply(interaction, { content: 'Use this command inside a server ticket.', flags: MessageFlags.Ephemeral });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;

    try {
      const { ticketData, canManageTicket } = await getTicketPermissionContext({ client: client || interaction.client, interaction });
      if (!ticketData) {
        return InteractionHelper.safeEditReply(interaction, { content: 'This channel is not a Beacon ticket. Use the command in an open ticket.' });
      }
      if (ticketData.status === 'closed') {
        return InteractionHelper.safeEditReply(interaction, { content: 'This ticket is closed and cannot be modified.' });
      }
      if (!canManageTicket) {
        return InteractionHelper.safeEditReply(interaction, { content: 'Only members with **Manage Channels** or the configured **Ticket Staff Role** can do that.' });
      }
      if (!interaction.channel?.permissionOverwrites?.edit) {
        return InteractionHelper.safeEditReply(interaction, { content: 'This ticket channel does not support the requested operation.' });
      }

      const user = interaction.options.getUser('user', true);
      if (protectedTicketParticipant(user.id, {
        creatorId: ticketData.userId,
        ownerId: interaction.guild.ownerId,
        botId: interaction.client.user.id,
      })) {
        return InteractionHelper.safeEditReply(interaction, { content: 'You cannot remove the ticket creator, the server owner or Beacon.' });
      }
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: false, SendMessages: false, ReadMessageHistory: false,
      }, { reason: `Removed from ticket by ${interaction.user.id}` });
      return InteractionHelper.safeEditReply(interaction, { content: `✅ Removed <@${user.id}> from this ticket.`, allowedMentions: { parse: [] } });
    } catch (error) {
      logger.warn('Ticket remove failed', { guildId: interaction.guildId, channelId: interaction.channelId, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, { content: 'Could not update this ticket. Check Beacon\'s channel permissions and role position, then try again.' });
    }
  },
};
