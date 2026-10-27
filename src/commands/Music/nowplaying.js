import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track')
        .setDMPermission(false),

    async execute(interaction, config, client) {
        if (!interaction.guildId) {
            return InteractionHelper.safeReply(interaction, { content: 'Use /music nowplaying in a server.', ephemeral: true });
        }
        await deferMusicCommand(interaction);
        const payload = buildNowPlayingReply(client || interaction.client, interaction.guildId);
        await InteractionHelper.safeEditReply(interaction, payload);
    },
};
