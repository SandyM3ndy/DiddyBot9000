import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { botConfig } from '../../config/bot.js';
import { generateTrollDM } from '../../services/trollDmService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send an AI-generated Diddy troll DM to a user.')
        .addStringOption(option => option.setName('user_id').setDescription('The Discord user ID to message.').setRequired(true))
        .setDefaultMemberPermissions(0)
        .setDMPermission(false),

    category: 'owner',

    async execute(interaction, config, client) {
        if (interaction.user.id !== botConfig.commands.primaryOwnerId) {
            return interaction.reply({ content: '❌ This command is owner-only.', flags: MessageFlags.Ephemeral });
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        const userId = interaction.options.getString('user_id', true).trim();
        if (!/^\d{17,20}$/.test(userId)) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Please enter a valid Discord user ID.' });
        if (userId === interaction.user.id) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot target yourself with the troll DM.' });

        try {
            const targetUser = await client.users.fetch(userId);
            if (targetUser.bot) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot send a troll DM to a bot account.' });
            const message = await generateTrollDM({ targetUser, guildName: interaction.guild?.name });
            const dmChannel = await targetUser.createDM();
            await dmChannel.send({ content: message, allowedMentions: { parse: [] } });
            await logEvent({ client: interaction.client, guild: interaction.guild, event: {
                action: 'AI Troll DM Sent',
                target: targetUser.tag + ' (' + targetUser.id + ')',
                executor: interaction.user.tag + ' (' + interaction.user.id + ')',
                metadata: { userId: targetUser.id, moderatorId: interaction.user.id, messageLength: message.length }
            }});
            return await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed('😈 Diddy Trolled', 'AI generated a 2-sentence troll DM and sent it to **' + targetUser.tag + '**.')] });
        } catch (error) {
            logger.error('AI troll DM command error:', error);
            if (error.code === 50007) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'I could not DM that user. Their privacy settings may block DMs.' });
            if (error.code === 10013 || error.code === 10007) return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'That user could not be found.' });
            if (error.message === 'OPENAI_API_KEY is not configured.') return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'The AI DM system is not configured. Add OPENAI_API_KEY to the bot environment.' });
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'The AI troll DM could not be generated or sent.' });
        }
    }
};