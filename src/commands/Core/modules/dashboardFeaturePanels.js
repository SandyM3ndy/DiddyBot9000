import {
    ActionRowBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getJoinToCreateConfig } from '../../../utils/database.js';
import { initializeJoinToCreate } from '../../../services/joinToCreateService.js';
import { openJoinToCreateDashboard } from '../../JoinToCreate/jointocreate.js';
import { openReactionRoleDashboard } from '../../Reaction_roles/reactroles.js';

export async function openDashboardFeature(feature, interaction) {
    if (feature === 'reactionRoles') {
        return openReactionRoleDashboard(interaction, null);
    }

    if (feature === 'joinToCreate') {
        const config = await getJoinToCreateConfig(interaction.client, interaction.guildId).catch(() => null);
        const triggerId = config?.triggerChannels?.[0];

        if (triggerId) {
            const channel = interaction.guild.channels.cache.get(triggerId)
                ?? await interaction.guild.channels.fetch(triggerId).catch(() => null);
            if (channel) {
                return openJoinToCreateDashboard(interaction, interaction.client, channel);
            }
        }

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🔊 Join to Create')
                    .setDescription('No Join to Create trigger channel is configured yet. Select a voice channel below to create the system.')
                    .setColor(getColor('info')),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId(`dashboard_jtc_setup:${interaction.guildId}`)
                        .setPlaceholder('Select the Join to Create voice channel...')
                        .setChannelTypes(ChannelType.GuildVoice)
                        .setMinValues(1)
                        .setMaxValues(1),
                ),
            ],
        });

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.ChannelSelect,
            time: 300000,
            max: 1,
            filter: i => i.user.id === interaction.user.id && i.customId === `dashboard_jtc_setup:${interaction.guildId}`,
        });

        collector.on('collect', async selectInteraction => {
            try {
                await selectInteraction.deferUpdate();
                const trigger = selectInteraction.channels.first();
                if (!trigger || trigger.type !== ChannelType.GuildVoice) {
                    return replyUserError(selectInteraction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Please select a valid voice channel.',
                    });
                }

                await initializeJoinToCreate(interaction.client, interaction.guildId, trigger.id, {
                    nameTemplate: "{username}'s Room",
                    userLimit: 0,
                    bitrate: 64000,
                });

                await openJoinToCreateDashboard(interaction, interaction.client, trigger);
            } catch (error) {
                await replyUserError(selectInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: error.userMessage || 'Failed to create the Join to Create system.',
                }).catch(() => {});
            }
        });

        return;
    }

    return replyUserError(interaction, {
        type: ErrorTypes.CONFIGURATION,
        message: 'That dashboard section is not available.',
    });
}
