import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticketrename')
        .setDescription('Rename the current ticket channel')
        .addStringOption(o => o.setName('name').setDescription('New ticket name').setRequired(true).setMaxLength(80))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

    async execute(interaction) {
        const name = interaction.options.getString('name', true).trim().toLowerCase()
            .replace(/[^a-z0-9-_ ]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 90);

        if (!name) {
            return InteractionHelper.safeReply(interaction, { content: 'Please provide a valid channel name.', ephemeral: true });
        }
        if (!interaction.channel?.setName) {
            return InteractionHelper.safeReply(interaction, { content: 'This command can only be used in a server channel.', ephemeral: true });
        }

        await interaction.channel.setName(name);
        await InteractionHelper.safeReply(interaction, { content: 'Ticket renamed to **' + name + '**.' });
    },
};