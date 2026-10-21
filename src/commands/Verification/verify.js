import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { verifyUser } from '../../services/verificationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself and gain access to the server')
        .setDMPermission(false),

    async execute(interaction, config, client) {
        if (!interaction.guild) return InteractionHelper.safeReply(interaction, { content: 'Run this command in a server.', flags: MessageFlags.Ephemeral });
        if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
        const result = await verifyUser(client, interaction.guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [infoEmbed('Already Verified', "You are already verified.")],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "Verification Complete",
                `You have been verified and given the **${result.roleName || 'verified'}** role! Welcome to the server! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
};
