import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketadd')
    .setDescription('Add a member to an existing support ticket')
    .setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('Server member').setRequired(true)),
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
      if (!interaction.channel?.permissionOverwrites?.edit) {
        return InteractionHelper.safeEditReply(interaction, { content: 'This ticket channel does not support the requested operation.' });
      }

      const user = interaction.options.getUser('user', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return InteractionHelper.safeEditReply(interaction, { content: 'That user is not a member of this server.' });
      }
      const existing = interaction.channel.permissionOverwrites.cache.get(user.id);
      if (existing?.allow?.has(PermissionFlagsBits.ViewChannel)) {
        return InteractionHelper.safeEditReply(interaction, { content: `<@${user.id}> already has ticket access.`, allowedMentions: { parse: [] } });
      }
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      }, { reason: `Added to ticket by ${interaction.user.id}` });
      return InteractionHelper.safeEditReply(interaction, { content: `✅ Added <@${user.id}> to this ticket.`, allowedMentions: { parse: [] } });
    } catch (error) {
      logger.warn('Ticket add failed', { guildId: interaction.guildId, channelId: interaction.channelId, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, { content: 'Could not update this ticket. Check Beacon\'s channel permissions and role position, then try again.' });
    }
  },
};
