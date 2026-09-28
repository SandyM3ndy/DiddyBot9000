import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getServerProgression, getLevelProgress } from '../../services/serverProgressionService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('View the server progression rank and XP'),

    async execute(interaction) {
        const data = await getServerProgression(interaction.client, interaction.guildId);
        const progress = getLevelProgress(data);

        const embed = createEmbed({
            title: '📈 Server Rank',
            description: '**' + interaction.guild.name + '**',
            color: 'primary',
            fields: [
                { name: '🏆 Level', value: String(data.level), inline: true },
                { name: '✨ Total XP', value: data.xp.toLocaleString(), inline: true },
                { name: '📊 Progress', value: progress.progressXp.toLocaleString() + ' / ' + progress.neededXp.toLocaleString() + ' XP (' + progress.percent + '%)', inline: false },
                { name: '💬 Messages', value: data.totalMessages.toLocaleString(), inline: true },
                { name: '🤖 Commands', value: data.totalCommands.toLocaleString(), inline: true },
            ],
        }).setTimestamp();

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};