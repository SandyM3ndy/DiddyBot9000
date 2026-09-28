import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticketadd')
        .setDescription('Add a member to the current ticket')
        .addUserOption(o => o.setName('user').setDescription('Member to add').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

    async execute(interaction) {
        const user = interaction.options.getUser('user', true);
        if (!interaction.channel?.permissionOverwrites) {
            return InteractionHelper.safeReply(interaction, { content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        }

        await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await InteractionHelper.safeReply(interaction, { content: 'Added ' + user + ' to this ticket.' });
    },
};