import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import {
  getServerProgression,
  getGlobalProgressionLeaderboard,
  getLevelProgress,
  getQuestCatalog,
} from '../../services/serverProgressionService.js';

const PAGE_SIZE = 10;
const VIEWS = [
  { id: 'overview', label: 'Overview', emoji: '📈' },
  { id: 'quests', label: 'Quests', emoji: '🎯' },
  { id: 'leaderboard', label: 'World Rankings', emoji: '🏆' },
  { id: 'milestones', label: 'Rewards', emoji: '🎁' },
];
const MILESTONES = [
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

function cleanName(value) {
  return String(value || 'Unknown Server').replace(/[*_~<>|]/g, '').slice(0, 70);
}

function meter(percent, blocks = 12) {
  const filled = Math.max(0, Math.min(blocks, Math.round(percent * blocks / 100)));
  return '▰'.repeat(filled) + '▱'.repeat(blocks - filled) + ' ' + percent + '%';
}

function getPosition(entries, guildId) {
  const index = entries.findIndex(entry => entry.guildId === guildId);
  return index < 0 ? null : index + 1;
}

function disabledEmbed() {
  return createEmbed({
    title: '📈 Server Progression Is Paused',
    description: 'Your server owner can enable Beacon progression from **/dashboard → Server Progression**.\n\nYou can still browse the **World Rankings** tab to see other participating communities.',
    color: 'warning',
    footer: 'No XP is earned until server progression is enabled.',
  });
}

function overviewEmbed(guild, data, entries) {
  const progress = getLevelProgress(data);
  const rank = getPosition(entries, guild.id);
  const finished = data.dailyQuests.filter(quest => quest.completed).length;
  const nextRank = rank && rank > 1 ? entries[rank - 2] : null;
  const needed = nextRank ? Math.max(0, nextRank.xp - data.xp + 1) : null;
  return createEmbed({
    title: '✨ ' + cleanName(guild.name) + ' • Progression',
    description: '**LEVEL ' + data.level + '**  ·  **' + data.xp.toLocaleString() + ' TOTAL XP**\n' +
      meter(progress.percent) + '\n' +
      progress.progressXp.toLocaleString() + ' / ' + progress.neededXp.toLocaleString() +
      ' XP toward Level ' + (data.level + 1),
    color: 'primary',
    fields: [
      { name: '🌍 World Rank', value: rank ? '#' + rank + ' of ' + entries.length : 'Not ranked yet', inline: true },
      { name: '🎯 Daily Quests', value: finished + ' / ' + data.dailyQuests.length + ' complete', inline: true },
      { name: '🔥 Next Rival', value: needed === null ? 'Top of the board or not ranked' : needed.toLocaleString() + ' XP to pass', inline: false },
      { name: '💬 Eligible Messages', value: data.totalMessages.toLocaleString(), inline: true },
      { name: '🤖 Eligible Commands', value: data.totalCommands.toLocaleString(), inline: true },
      { name: '📌 Your Next Goal', value: data.dailyQuests.find(quest => !quest.completed)?.title || 'All daily quests finished — nice work!', inline: false },
    ],
    footer: 'Every server starts somewhere. Progress is saved between days.',
  });
}

function questsEmbed(guild, data) {
  const quests = data.dailyQuests || [];
  const finished = quests.filter(quest => quest.completed).length;
  const catalogSize = getQuestCatalog().length;
  const fields = quests.map((quest, i) => {
    const progress = Math.min(quest.target, Number(quest.progress) || 0);
    const pct = quest.target ? Math.floor(progress * 100 / quest.target) : 100;
    const difficulty = quest.difficulty || 'Classic';
    return {
      name: (quest.completed ? '✅ ' : '▫️ ') + (i + 1) + '. ' + quest.title + '  •  ' + difficulty,
      value: quest.description + '\n' + meter(pct, 8) + '  (' + progress + '/' + quest.target +
        ')\n🏆 **+' + quest.reward.toLocaleString() + ' XP**' + (quest.completed ? '  ·  Claimed' : ''),
      inline: false,
    };
  });
  return createEmbed({
    title: '🎯 ' + cleanName(guild.name) + ' • Daily Quests',
    description: '**' + finished + '/' + quests.length + ' completed today**\n' +
      'Your server receives a rotating set of community challenges from a pool of **' +
      catalogSize + '** quests. Smaller communities get achievable starter objectives.\n\n' +
      '🟩 Completed quests award Server XP automatically.',
    color: 'primary',
    fields: fields.length ? fields : [{ name: 'No Quests Yet', value: 'Send a message after enabling progression to begin.' }],
    footer: 'Quests reset daily at 00:00 UTC. Activity must qualify for XP to count.',
  });
}

function leaderboardEmbed(guild, entries, page) {
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, pages - 1));
  const rank = getPosition(entries, guild.id);
  const lines = entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
    .map((entry, i) => {
      const position = safePage * PAGE_SIZE + i + 1;
      const medal = ['🥇', '🥈', '🥉'][position - 1] || '🏅';
      const name = cleanName(entry.guildName);
      const emphasis = entry.guildId === guild.id ? ' ◀ YOUR SERVER' : '';
      return medal + ' **#' + position + ' ' + name + '**' + emphasis +
        '\n      Level ' + entry.level + '  •  **' + entry.xp.toLocaleString() + ' XP**';
    });
  const nextRival = rank && rank > 1 ? entries[rank - 2] : null;
  return createEmbed({
    title: '🌍 Beacon • World Rankings',
    description: 'Communities ranked by **all-time Server XP**.\n\n' +
      (lines.length ? lines.join('\n\n') : 'No communities have earned XP yet. Be the first!') +
      '\n\n━━━━━━━━━━━━━━━━\n' +
      '**Your position:** ' + (rank ? '#' + rank + ' of ' + entries.length : 'Not yet ranked') +
      (nextRival ? '\n**Next rival:** ' + cleanName(nextRival.guildName) + ' · ' +
        Math.max(0, nextRival.xp - entries[rank - 1].xp + 1).toLocaleString() + ' XP away' : ''),
    color: 'info',
    footer: 'Page ' + (safePage + 1) + '/' + pages + ' • ' + entries.length +
      ' participating servers • Rankings update when refreshed',
  });
}

function milestonesEmbed(guild, data) {
  const progress = getLevelProgress(data);
  const next = MILESTONES.find(([level]) => level > data.level);
  return createEmbed({
    title: '🎁 ' + cleanName(guild.name) + ' • Level Rewards',
    description: '**Current Level ' + data.level + '**\n' + meter(progress.percent) +
      '\n\n' + MILESTONES.map(([level, reward]) =>
        (data.level >= level ? '✅' : '🔒') + ' **Level ' + level + '** — ' + reward
      ).join('\n'),
    color: 'primary',
    fields: [
      { name: '🎯 Next Milestone', value: next ? 'Level ' + next[0] + ' — ' + next[1] : 'All listed milestones reached!' },
    ],
    footer: 'All-time XP and unlocked rewards are preserved. No seasonal resets.',
  });
}

function buildButtons(interactionId, view, page, entriesCount, expired = false) {
  const nav = new ActionRowBuilder().addComponents(VIEWS.map(item =>
    new ButtonBuilder()
      .setCustomId('progress_panel:' + interactionId + ':' + item.id)
      .setLabel(item.label)
      .setEmoji(item.emoji)
      .setStyle(item.id === view ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(expired)
  ));
  const refresh = new ButtonBuilder()
    .setCustomId('progress_panel:' + interactionId + ':refresh')
    .setLabel('Refresh')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(expired);
  const rows = [nav, new ActionRowBuilder().addComponents(refresh)];
  if (view === 'leaderboard' && entriesCount > PAGE_SIZE) {
    rows[1].addComponents(
      new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':prev')
        .setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(expired || page === 0),
      new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':next')
        .setLabel('Next').setStyle(ButtonStyle.Secondary)
        .setDisabled(expired || (page + 1) * PAGE_SIZE >= entriesCount),
    );
  }
  return rows;
}

async function buildPanel(interaction, view, page, expired = false) {
  const [config, data, entries] = await Promise.all([
    getGuildConfig(interaction.client, interaction.guildId),
    getServerProgression(interaction.client, interaction.guildId),
    getGlobalProgressionLeaderboard(interaction.client),
  ]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1));
  const enabled = config?.serverProgression?.enabled === true;
  const embed = view === 'leaderboard'
    ? leaderboardEmbed(interaction.guild, entries, currentPage)
    : !enabled ? disabledEmbed()
      : view === 'quests' ? questsEmbed(interaction.guild, data)
        : view === 'milestones' ? milestonesEmbed(interaction.guild, data)
          : overviewEmbed(interaction.guild, data, entries);
  return { embeds: [embed], components: buildButtons(interaction.id, view, currentPage, entries.length, expired),
    page: currentPage };
}

export default {
  data: new SlashCommandBuilder()
    .setName('progression')
    .setDescription('Explore server progression, daily quests and Beacon world rankings')
    .addSubcommand(sub => sub.setName('overview').setDescription('Open the server progression dashboard'))
    .addSubcommand(sub => sub.setName('quests').setDescription('Explore daily quests and rewards'))
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('Browse global server rankings'))
    .addSubcommand(sub => sub.setName('rank').setDescription('View your server XP and world position'))
    .addSubcommand(sub => sub.setName('milestones').setDescription('Browse level rewards and milestones')),
  category: 'Community',

  async execute(interaction) {
    if (!interaction.guild) {
      return InteractionHelper.safeReply(interaction, {
        content: 'Open Beacon progression from a Discord server.',
        flags: MessageFlags.Ephemeral,
      });
    }
    // Public on purpose: server achievements should be easy for members to share.
    if (!(await InteractionHelper.safeDefer(interaction, {}))) return;
    const subcommand = interaction.options.getSubcommand();
    let view = subcommand === 'rank' ? 'overview' : subcommand;
    let page = 0;
    let payload = await buildPanel(interaction, view, page);
    await InteractionHelper.safeEditReply(interaction, { embeds: payload.embeds, components: payload.components });
    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply?.createMessageComponentCollector) return;

    const prefix = 'progress_panel:' + interaction.id + ':';
    const collector = reply.createMessageComponentCollector({
      time: 5 * 60 * 1000,
      filter: button => button.customId.startsWith(prefix),
    });
    collector.on('collect', async button => {
      if (button.user.id !== interaction.user.id) {
        await button.reply({ content: 'Use /progression to open your own leaderboard panel.',
          flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      const acknowledged = await button.deferUpdate().then(() => true).catch(() => false);
      if (!acknowledged) return;
      const action = button.customId.slice(prefix.length);
      if (action === 'next') page += 1;
      else if (action === 'prev') page = Math.max(0, page - 1);
      else if (action !== 'refresh' && VIEWS.some(item => item.id === action)) {
        view = action;
        page = 0;
      }
      try {
        payload = await buildPanel(interaction, view, page);
        page = payload.page;
        await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      } catch {
        await interaction.editReply({ content: 'Could not refresh the board right now. Please try /progression again.',
          components: [] }).catch(() => {});
        collector.stop('error');
      }
    });
    collector.on('end', async () => {
      try {
        const disabled = buildButtons(interaction.id, view, page,
          view === 'leaderboard' ? 11 : 0, true);
        await interaction.editReply({ components: disabled }).catch(() => {});
      } catch { /* The source message may have been deleted. */ }
    });
  },
};
