import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getServerProgression, getLevelProgress, getGlobalProgressionLeaderboard,
} from '../../services/serverProgressionService.js';

function progressBar(percent) {
  const filled = Math.max(0, Math.min(12, Math.round(percent * 12 / 100)));
  return '▰'.repeat(filled) + '▱'.repeat(12 - filled) + ' ' + percent + '%';
}

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your server level, XP and world ranking'),
  category: 'Community',
  async execute(interaction) {
    const [data, entries] = await Promise.all([
      getServerProgression(interaction.client, interaction.guildId),
      getGlobalProgressionLeaderboard(interaction.client),
    ]);
    const progress = getLevelProgress(data);
    const index = entries.findIndex(entry => entry.guildId === interaction.guildId);
    const next = index > 0 ? entries[index - 1] : null;
    const guildName = String(interaction.guild?.name || 'This Server').replace(/[*_~<>|]/g, '').slice(0, 70);
    const embed = createEmbed({
      title: '🏆 ' + guildName + ' • Server Rank',
      description: '**Level ' + data.level + '**  ·  **' + data.xp.toLocaleString() + ' XP**\n' +
        progressBar(progress.percent) + '\n' +
        progress.progressXp.toLocaleString() + ' / ' + progress.neededXp.toLocaleString() +
        ' XP toward Level ' + (data.level + 1),
      color: 'primary',
      fields: [
        { name: '🌍 Global Position', value: index >= 0 ? '#' + (index + 1) + ' / ' + entries.length : 'Not ranked yet', inline: true },
        { name: '🎯 Daily Quests', value: data.dailyQuests.filter(quest => quest.completed).length +
            ' / ' + data.dailyQuests.length + ' finished', inline: true },
        { name: '🔥 Next Rival', value: next ? next.guildName + ' • ' +
            Math.max(0, next.xp - data.xp + 1).toLocaleString() + ' XP to pass' : 'No higher ranked rival', inline: false },
        { name: '💬 Tracked Messages', value: data.totalMessages.toLocaleString(), inline: true },
        { name: '🤖 Tracked Commands', value: data.totalCommands.toLocaleString(), inline: true },
      ],
      footer: 'Use /progression leaderboard to explore the interactive world rankings.',
    });
    return InteractionHelper.safeReply(interaction, { embeds: [embed] });
  },
};
