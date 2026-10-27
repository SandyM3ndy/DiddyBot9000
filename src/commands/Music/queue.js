import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildQueueReply } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue')
        .setDMPermission(false)
        .addIntegerOption((opt) =>
            opt.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(999),
        ),

    async execute(interaction, config, client) {
        if (!(await InteractionHelper.safeDefer(interaction))) return;
        if (!interaction.guildId) {
            return InteractionHelper.safeEditReply(interaction, { content: 'Use /music queue inside a server.' });
        }
        const page = (interaction.options.getInteger('page') || 1) - 1;
        const payload = buildQueueReply(client || interaction.client, interaction.guildId, page);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: payload.embeds,
            components: payload.components,
        });
    },
};
