import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getServerProgression, getLevelProgress } from '../../services/serverProgressionService.js';

const MILESTONES = [
  [2, '📣 Level-up announcements'], [5, '🎯 4 daily quests'],
  [10, '⚡ 5% Server XP boost'], [15, '🎯 5 daily quests'],
  [20, '💎 Veteran Server milestone'], [25, '⚡ 10% Server XP boost'],
  [30, '🎯 6 daily quests'], [40, '🏆 Elite Server milestone'],
  [50, '👑 Legendary Server milestone'],
];

export default {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Browse Beacon server level milestones and unlocks'),
  category: 'Community',
  async execute(interaction) {
    const data = await getServerProgression(interaction.client, interaction.guildId);
    const progress = getLevelProgress(data);
    const next = MILESTONES.find(([level]) => level > data.level);
    const bars = Math.round(progress.percent * 12 / 100);
    const description = '**Level ' + data.level + '** • **' + data.xp.toLocaleString() +
      ' XP**\n' + '▰'.repeat(bars) + '▱'.repeat(12 - bars) + ' ' +
      progress.percent + '% toward Level ' + (data.level + 1) + '\n\n' +
      MILESTONES.map(([level, perk]) => (data.level >= level ? '✅' : '🔒') +
        ' **Level ' + level + '** — ' + perk).join('\n');
    const embed = createEmbed({
      title: '🎁 Beacon • Level Rewards',
      description,
      color: 'primary',
      fields: [{ name: '🎯 Next Milestone', value: next
        ? 'Level ' + next[0] + ' — ' + next[1] : 'Every listed milestone unlocked!' }],
      footer: 'Use /progression milestones for the interactive progression hub.',
    });
    return InteractionHelper.safeReply(interaction, { embeds: [embed] });
  },
};
