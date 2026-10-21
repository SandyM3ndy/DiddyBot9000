import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { logger } from '../../utils/logger.js';
import { normalizeTicketChannelName } from '../../utils/ticket/ticketCommandHelpers.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketrename')
    .setDescription('Rename an existing support ticket')
    .setDMPermission(false)
    .addStringOption(o => o.setName('name').setDescription('New ticket channel name').setRequired(true).setMaxLength(80)),
  category: 'Ticket',

  async execute(interaction, config, client) {
    if (!interaction.inGuild?.()) {
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
      if (typeof interaction.channel?.setName !== 'function') {
        return InteractionHelper.safeEditReply(interaction, { content: 'This ticket channel does not support the requested operation.' });
      }

      const name = normalizeTicketChannelName(interaction.options.getString('name', true));
      if (!name) {
        return InteractionHelper.safeEditReply(interaction, { content: 'That name contains no valid characters. Use letters, numbers, spaces, dashes or underscores.' });
      }
      if (interaction.channel.name === name) {
        return InteractionHelper.safeEditReply(interaction, { content: `This ticket is already named **${name}**.` });
      }
      await interaction.channel.setName(name, `Renamed by ${interaction.user.id}`);
      return InteractionHelper.safeEditReply(interaction, { content: `✅ Ticket renamed to **${name}**.` });
    } catch (error) {
      logger.warn('Ticket rename failed', { guildId: interaction.guildId, channelId: interaction.channelId, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, { content: 'Could not update this ticket. Check Beacon\'s channel permissions and role position, then try again.' });
    }
  },
};
