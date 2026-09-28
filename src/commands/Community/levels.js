import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getServerProgression, getLevelProgress } from '../../services/serverProgressionService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('levels')
        .setDescription('Show the server progression milestones'),

    async execute(interaction) {
        const data = await getServerProgression(interaction.client, interaction.guildId);
        const progress = getLevelProgress(data);
        const milestones = [
            [2, '📣 Level-up announcements'],
            [5, '🎯 4 daily quests'],
            [10, '⚡ 5% Server XP boost'],
            [15, '🎯 5 daily quests'],
            [20, '💎 Veteran Server milestone'],
            [25, '⚡ 10% Server XP boost'],
            [30, '🎯 6 daily quests'],
            [40, '🏆 Elite Server milestone'],
            [50, '👑 Legendary Server milestone'],
        ];

        const description = milestones.map(([level, perk]) => {
            const marker = data.level >= level ? '✅' : '🔒';
            return marker + ' **Level ' + level + '** — ' + perk;
        }).join('\n');

        const embed = createEmbed({
            title: '🎯 Server Progression',
            description: description,
            color: 'primary',
            fields: [
                { name: 'Current Level', value: String(data.level), inline: true },
                { name: 'Next Level', value: data.level >= 50 ? '50+' : String(data.level + 1), inline: true },
                { name: 'Current Progress', value: progress.percent + '%', inline: true },
            ],
        }).setTimestamp();

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};