import { SlashCommandBuilder } from 'discord.js';
import playCommand from './play.js';
import queueCommand from './queue.js';
import nowPlayingCommand from './nowplaying.js';
import joinCommand from './join.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import {
    skipTrack,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    shuffleQueue,
    setLoopMode,
    setVolume,
    seekTrack,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setTwentyFourSeven,
    leaveVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Play tracks and manage the music player')
        .addSubcommand(s => s.setName('play').setDescription('Play a song or add it to the queue')
            .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)))
        .addSubcommand(s => s.setName('queue').setDescription('Show the music queue')
            .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(999)))
        .addSubcommand(s => s.setName('nowplaying').setDescription('Show the currently playing track'))
        .addSubcommand(s => s.setName('join').setDescription('Join your voice channel without playing a track'))
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('Pause playback'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('Resume playback'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Skip the current track'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('Stop playback and clear the queue'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('Shuffle the queue'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('Set loop mode')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('Loop mode')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Off', value: 'none' },
                            { name: 'Track', value: 'track' },
                            { name: 'Queue', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('Set playback volume')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('Volume (0-100)').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Seek to a position in the current track')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('Position in seconds').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove a track from the queue')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Move a track in the queue')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('Current position').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('New position').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Clear the queue'),
        )
        .addSubcommand(sub => sub.setName('status').setDescription('Check music service, voice and queue health'))
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Disconnect the bot from the voice channel'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('Toggle 24/7 mode (stay in voice channel when idle)')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('Enable or disable 24/7 mode').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        // Original handlers retain their retry, page and reply behaviour.
        // Delegate before the common defer to avoid double acknowledgements.
        if(subcommand==='play')return playCommand.execute(interaction,config,client||interaction.client);
        if(subcommand==='queue')return queueCommand.execute(interaction,config,client||interaction.client);
        if(subcommand==='nowplaying')return nowPlayingCommand.execute(interaction,config,client||interaction.client);
        if(subcommand==='join')return joinCommand.execute(interaction,config,client||interaction.client);
        await deferMusicCommand(interaction);

        switch (subcommand) {
            case 'status': {
                const nodes = client?.riffy?.nodeMap ? [...client.riffy.nodeMap.values()] : [];
                const active = nodes.filter(node => node.connected).length;
                const player = client?.riffy?.players?.get(interaction.guildId);
                const voice = player?.voiceChannel ? '<#' + player.voiceChannel + '>' : 'Not connected';
                const embed = createEmbed({
                    title: '🎵 Beacon • Music Diagnostics',
                    description: active ? '**🟢 Music service connected.**' : '**🟠 Lavalink disconnected or not configured.**',
                    color: active ? 'success' : 'warning',
                    fields: [
                        { name: '📡 Lavalink Nodes', value: active + ' / ' + nodes.length + ' connected', inline: true },
                        { name: '🔊 Voice Channel', value: voice, inline: true },
                        { name: '🎶 Queue Length', value: String(player?.queue?.length ?? 0), inline: true },
                        { name: '▶️ Playback State', value: player?.playing ? 'Playing' : player?.paused ? 'Paused' : 'Idle', inline: true },
                    ],
                    footer: 'Beacon • Music Service Health',
                });
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                break;
            }
            case 'pause': {
                const embed = await pausePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'resume': {
                const embed = await resumePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'skip': {
                const embed = await skipTrack(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'stop': {
                const embed = await stopPlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'shuffle': {
                const embed = await shuffleQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'loop': {
                const embed = await setLoopMode(client, interaction, interaction.options.getString('mode'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'volume': {
                const embed = await setVolume(client, interaction, interaction.options.getInteger('level'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'seek': {
                const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'remove': {
                const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'move': {
                const embed = await moveInQueue(
                    client,
                    interaction,
                    interaction.options.getInteger('from'),
                    interaction.options.getInteger('to'),
                );
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'clear': {
                const embed = await clearQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'leave': {
                const embed = await leaveVoiceChannel(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case '247': {
                const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            default:
                await InteractionHelper.safeEditReply(interaction, {
                    content: 'Unknown music subcommand.',
                });
        }
    },
};
