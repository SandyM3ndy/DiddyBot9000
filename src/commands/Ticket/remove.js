import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticketremove')
        .setDescription('Remove a member from the current ticket')
        .addUserOption(o => o.setName('user').setDescription('Member to remove').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

    async execute(interaction) {
        const user = interaction.options.getUser('user', true);
        if (!interaction.channel?.permissionOverwrites) {
            return InteractionHelper.safeReply(interaction, { content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        }

        if (user.id === interaction.guild.ownerId || user.id === interaction.client.user.id) {
            return InteractionHelper.safeReply(interaction, { content: 'That member cannot be removed from the ticket.', ephemeral: true });
        }

        await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false });
        await InteractionHelper.safeReply(interaction, { content: 'Removed ' + user + ' from this ticket.' });
    },
};