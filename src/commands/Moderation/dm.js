import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message to a user (Staff only)")
        .addStringOption(option =>
            option
                .setName("user")
                .setDescription("Enter a user ID or @mention")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("from")
                .setDescription("Name shown as the sender (defaults to Staff Team)")
                .setRequired(false)
                .setMaxLength(100)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn("DM interaction defer failed", {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: "dm"
            });
            return;
        }

        const userInput = interaction.options.getString("user", true);
        const message = interaction.options.getString("message", true);
        const senderName = interaction.options.getString("from")?.trim() || "Staff Team";

        try {
            // Extract a user ID from either an ID or a mention
            const userId = userInput.replace(/[<@!>]/g, "");

            if (!/^\d{17,20}$/.test(userId)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: "Please enter a valid Discord user ID or @mention."
                });
            }

            if (message.length > 2000) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: "Your message must be 2,000 characters or less."
                });
            }

            // Fetch the user globally
            const targetUser = await client.users.fetch(userId);

            if (targetUser.bot) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: "You cannot send a DM to a bot account."
                });
            }

            const sanitized = sanitizeMarkdown(message);

            const dmChannel = await targetUser.createDM();

            await dmChannel.send({
                embeds: [
                    successEmbed(
                        `Message from ${senderName}`,
                        sanitized
                    ).setFooter({
                        text: `You cannot reply to this message. | Logger ID: ${interaction.id}`
                    })
                ]
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "DM Sent",
                        `Your message was successfully sent to **${targetUser.tag}**.`
                    )
                ]
            });

        } catch (error) {
            logger.error("DM command error:", error);

            if (error.code === 50007) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: "I couldn't send a DM to that user. They may not share a server with Beacon or Discord may be blocking the DM."
                });
            }

            if (error.code === 10013 || error.code === 10007) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: "That user could not be found."
                });
            }

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: "Something went wrong while trying to send the DM."
            });
        }
    }
};
