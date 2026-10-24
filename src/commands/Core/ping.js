import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Checks the bot's latency and API speed"),

    async prefixExecute(interaction) {
        try {
            const startTime = Date.now();
            const pingingMessage = await interaction.reply({ content: 'Pinging...' });

            const latency = Date.now() - startTime;
            const apiLatency = Number.isFinite(interaction.client.ws?.ping) && interaction.client.ws.ping >= 0
                ? `${Math.round(interaction.client.ws.ping)}ms` : 'Unavailable';

            const embed = createEmbed({
                title: '🏓 Pong!',
                description: 'Connection looks healthy.',
                color: 'success',
            }).addFields(
                { name: '⚡ Response Latency', value: `${latency}ms`, inline: true },
                { name: '🌐 Gateway Heartbeat', value: apiLatency, inline: true },
            );

            await pingingMessage.edit({ content: null, embeds: [embed] });
        } catch (error) {
            logger.error('Ping prefix command error:', error);
            if (!interaction.replied && !interaction._replyMessage) {
                await interaction.channel.send({
                    embeds: [createEmbed({ title: 'System Error', description: 'Could not determine latency at this time.', color: 'error' })],
                }).catch(() => {});
            }
        }
    },

    async execute(interaction) {

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ping interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            const startTime = interaction._commandStartTime || interaction.createdTimestamp;
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Number.isFinite(interaction.client.ws?.ping) && interaction.client.ws.ping >= 0
                ? `${Math.round(interaction.client.ws.ping)}ms` : 'Unavailable';

            const embed = createEmbed({
                title: "🏓 Pong!",
                description: "Connection looks healthy.",
                color: "success",
            }).addFields(
                { name: "⚡ Response Latency", value: `${latency}ms`, inline: true },
                { name: "🌐 Gateway Heartbeat", value: apiLatency, inline: true },
            );

            await InteractionHelper.safeEditReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            logger.error('Ping command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: 'System Error', description: 'Could not determine latency at this time.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send error reply:', replyError);
            }
        }
    },
};