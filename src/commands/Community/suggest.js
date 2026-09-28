import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Post a server suggestion')
        .addStringOption(o => o.setName('idea').setDescription('Your suggestion').setRequired(true).setMaxLength(1000)),

    async execute(interaction) {
        const idea = interaction.options.getString('idea', true).trim();
        const embed = createEmbed({
            title: '💡 New Suggestion',
            description: idea,
            color: 'primary',
            fields: [
                { name: 'Submitted by', value: String(interaction.user), inline: true },
                { name: 'Status', value: '🟡 Under review', inline: true },
            ],
        }).setTimestamp();

        const message = await interaction.channel.send({ embeds: [embed] });
        await message.react('👍').catch(() => {});
        await message.react('👎').catch(() => {});

        await InteractionHelper.safeReply(interaction, {
            content: 'Your suggestion has been posted.',
            ephemeral: true,
        });
    },
};