import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

const MUSIC_RETRY_DELAY_MS = 2_000;

function isMusicTransportError(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'ECONNRESET'
        || error?.code === 'ECONNREFUSED'
        || error?.code === 'ETIMEDOUT'
        || message.includes('fetch failed')
        || message.includes('socket')
        || message.includes('lavalink')
        || message.includes('node');
}

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt.setName('query').setDescription('Song name or URL').setRequired(true),
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const query = interaction.options.getString('query');

        try {
            const result = await playQuery(client, interaction, query);
            await replyMusicSuccess(interaction, result.embed);
        } catch (error) {
            // A Lavalink node can briefly reconnect between the initial check and resolve().
            if (isMusicTransportError(error)) {
                await new Promise((resolve) => setTimeout(resolve, MUSIC_RETRY_DELAY_MS));
                try {
                    const result = await playQuery(client, interaction, query);
                    await replyMusicSuccess(interaction, result.embed);
                    return;
                } catch (retryError) {
                    throw new TitanBotError(
                        'Music service unavailable',
                        ErrorTypes.NETWORK,
                        'Beacon could not reach the music service right now. Lavalink may be reconnecting. Please try /play again in a few seconds.',
                        { errorCode: 'MUSIC_SERVICE_UNAVAILABLE', cause: retryError?.message },
                    );
                }
            }

            throw error;
        }
    },
};
