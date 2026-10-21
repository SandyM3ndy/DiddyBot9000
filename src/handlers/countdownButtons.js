import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
function createControlButtons(countdownId, isPaused = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`countdown_pause:${countdownId}`)
            .setLabel(isPaused ? "▶️ Resume" : "⏸️ Pause")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`countdown_cancel:${countdownId}`)
            .setLabel("❌ Cancel")
            .setStyle(ButtonStyle.Danger),
    );
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [
        h > 0 ? h.toString().padStart(2, "0") : null,
        m.toString().padStart(2, "0"),
        s.toString().padStart(2, "0"),
    ]
        .filter(Boolean)
        .join(":");
}

function startCountdown(countdownId, countdownData, activeCountdowns) {
    if (countdownData.interval) {
        clearInterval(countdownData.interval);
        countdownData.interval = null;
    }

    logger.info(`Countdown active: ${countdownData.title} (${Math.ceil(countdownData.remainingTime / 1000)}s remaining)`);

    // Tick once per second, but reduce Discord API edits on long-running timers.
    // Never issue overlapping message edits when Discord responds slowly.
    countdownData.interval = setInterval(async () => {
        if (countdownData.isPaused || countdownData.updating || !activeCountdowns.has(countdownId)) return;
        countdownData.updating = true;

        try {
            const now = Date.now();
            const remainingMs = Math.max(0, countdownData.endTime - now);
            countdownData.remainingTime = remainingMs;
            const seconds = Math.ceil(remainingMs / 1000);

            if (seconds <= 0) {
                cleanupCountdown(countdownId, activeCountdowns);
                await countdownData.message.edit({
                    embeds: [successEmbed(`⏱️ ${countdownData.title} (Finished!)`, "⏰ Time's up!")],
                    components: [],
                });
                return;
            }

            const cadence = seconds > 3600 ? 60_000 : seconds > 60 ? 10_000 : 1000;
            if (now - countdownData.lastUpdate < cadence) return;
            countdownData.lastUpdate = now;
            await countdownData.message.edit({
                embeds: [successEmbed(
                    `⏱️ ${countdownData.title}`,
                    `Time remaining: **${formatTime(seconds)}**`,
                )],
                components: [createControlButtons(countdownId, false)],
            });
        } catch (error) {
            logger.warn('Countdown message update failed', { countdownId, error: error?.message });
            // Missing channel/message or missing permissions are not transient.
            if ([10003, 10008, 50001, 50013].includes(Number(error?.code))) {
                cleanupCountdown(countdownId, activeCountdowns);
            }
        } finally {
            countdownData.updating = false;
        }
    }, 1000);
}

function cleanupCountdown(countdownId, activeCountdowns) {
    const countdownData = activeCountdowns.get(countdownId);
    if (countdownData) {
        clearInterval(countdownData.interval);
        activeCountdowns.delete(countdownId);
    }
}

async function countdownButtonHandler(interaction, client, args) {
    const { activeCountdowns } = await import('../commands/Tools/countdown.js');
    // Discord's router passes only the data after ':' as args; the action lives in the prefix.
    const action = interaction.customId.startsWith('countdown_pause:') ? 'pause'
        : interaction.customId.startsWith('countdown_cancel:') ? 'cancel' : null;
    const countdownId = args?.[0];
    if (!action || !countdownId) {
        return interaction.reply({ content: 'This timer control is invalid. Start a new countdown.', flags: ['Ephemeral'] });
    }
    const countdownData = activeCountdowns.get(countdownId);

    if (!countdownData) {
        return interaction.reply({ content: 'This countdown has finished or is no longer active.', flags: ['Ephemeral'] });
    }

    const canModerate = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
        || interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages);
    if (countdownData.ownerId !== interaction.user.id && !canModerate) {
        return interaction.reply({ content: 'Only the countdown creator or a moderator can control this timer.', flags: ['Ephemeral'] });
    }

    // Acknowledge before editing a possibly rate-limited timer message.
    await interaction.deferReply({ flags: ['Ephemeral'] });

    try {
        if (action === 'pause') {
            if (countdownData.isPaused) {
                countdownData.isPaused = false;
                countdownData.endTime = Date.now() + countdownData.remainingTime;
                countdownData.lastUpdate = 0;
                startCountdown(countdownId, countdownData, activeCountdowns);
                await countdownData.message.edit({
                    embeds: [successEmbed(`⏱️ ${countdownData.title}`, `Time remaining: **${formatTime(Math.ceil(countdownData.remainingTime / 1000))}**`)],
                    components: [createControlButtons(countdownId, false)],
                });
                await interaction.editReply({ content: '▶️ Countdown resumed.' });
                return;
            }

            countdownData.isPaused = true;
            countdownData.remainingTime = Math.max(0, countdownData.endTime - Date.now());
            if (countdownData.interval) clearInterval(countdownData.interval);
            countdownData.interval = null;
            await countdownData.message.edit({
                embeds: [successEmbed(`⏱️ ${countdownData.title} (Paused)`, `Paused at **${formatTime(Math.ceil(countdownData.remainingTime / 1000))}**`)],
                components: [createControlButtons(countdownId, true)],
            });
            await interaction.editReply({ content: '⏸️ Countdown paused.' });
            return;
        }

        if (action === 'cancel') {
            cleanupCountdown(countdownId, activeCountdowns);
            await countdownData.message.edit({
                embeds: [successEmbed(`⏱️ ${countdownData.title} (Cancelled)`, 'The countdown was cancelled.')],
                components: [],
            });
            await interaction.editReply({ content: '❌ Countdown cancelled.' });
            return;
        }

        await interaction.editReply({ content: 'Unknown countdown action.' });
    } catch (error) {
        logger.warn('Countdown control failed', { countdownId, action, error: error?.message });
        await interaction.editReply({ content: 'Could not update this timer. Check my channel permissions and try again.' }).catch(() => {});
    }
}

export { createControlButtons, formatTime, startCountdown, cleanupCountdown, countdownButtonHandler };
export default countdownButtonHandler;