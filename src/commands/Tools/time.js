import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import unixCommand from './unixtime.js';
import countdownCommand from './countdown.js';
export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Check time, Unix timestamps, or run a countdown')
        .addSubcommand(sub => sub.setName('now').setDescription('Show the current time in a timezone')
            .addStringOption(o => o.setName('timezone').setDescription('Timezone, e.g. Australia/Brisbane or UTC')))
        .addSubcommand(sub => sub.setName('unix').setDescription('Show Unix timestamps in seconds and milliseconds'))
        .addSubcommand(sub => sub.setName('countdown').setDescription('Start a timer with pause and cancel buttons')
            .addIntegerOption(o => o.setName('minutes').setDescription('Minutes (0-1440)').setMinValue(0).setMaxValue(1440))
            .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0-59)').setMinValue(0).setMaxValue(59))
            .addStringOption(o => o.setName('title').setDescription('Optional countdown name').setMaxLength(100))),

    async execute(interaction) {
        const subcommand=interaction.options.getSubcommand();
        if (subcommand === 'unix') return unixCommand.execute(interaction);
        if (subcommand === 'countdown') return countdownCommand.execute(interaction);
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('en-US', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Invalid timezone requested: ${timezone}`);
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Invalid timezone. Please use a valid timezone identifier (e.g., UTC, America/New_York, Europe/London)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 Current Time',
                    `**${timezone}:** ${timeString}\n` +
                    `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                    `**ISO String:** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'Failed to get current time. Please try again.',
            {
                autoDefer: true,
                deferOptions: {}
            }
        );
    },
};