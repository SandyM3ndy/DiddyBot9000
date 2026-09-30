import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import {
  getServerProgression,
  getGlobalProgressionLeaderboard,
  getLevelProgress,
} from '../../services/serverProgressionService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('progression')
    .setDescription('View server progression, daily quests, or the global leaderboard')
    .addSubcommand(sub => sub
      .setName('overview')
      .setDescription('View this server\'s progression'))
    .addSubcommand(sub => sub
      .setName('quests')
      .setDescription('View today\'s server quests'))
    .addSubcommand(sub => sub
      .setName('leaderboard')
      .setDescription('View the global server XP leaderboard')),
  category: 'Community',

  async execute(interaction) {
    const config = await getGuildConfig(interaction.client, interaction.guildId);

    if (config?.serverProgression?.enabled !== true) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '📈 Server Progression Disabled',
          description: 'The server owner has not enabled Server Progression yet.\n\nEnable it from **/configwizard → Server Progression**.',
          color: 'warning',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'leaderboard') {
      const entries = (await getGlobalProgressionLeaderboard(interaction.client)).slice(0, 10);
      const lines = entries.length
        ? entries.map((entry, index) =>
            `**#${index + 1}** ${entry.guildName} — **Level ${entry.level}** · ${entry.xp.toLocaleString()} XP`)
        : ['No servers have earned Server XP yet.'];

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: '🌎 Global Server Leaderboard',
          description: 'The highest-progressing servers on Beacon.\n\n' + lines.join('\n'),
          color: 'info',
          footer: 'Server XP is earned through activity and daily quests.',
        })],
      });
    }

    const data = await getServerProgression(interaction.client, interaction.guildId);
    const progress = getLevelProgress(data);
    const questLines = data.dailyQuests.map(quest =>
      `${quest.completed ? '✅' : '▫️'} **${quest.title}**\n> 🎯 **What to do:** ${quest.description}\n> 📊 **Progress:** ${Math.min(quest.progress, quest.target)}/${quest.target} · 🏆 **Reward:** +${quest.reward} XP`
    );

    const perks = [];
    if (data.level >= 2) perks.push('📣 Level-up announcements');
    if (data.level >= 5) perks.push('🎯 4 daily quests');
    if (data.level >= 10) perks.push('⚡ 5% Server XP boost');
    if (data.level >= 15) perks.push('🎯 5 daily quests');
    if (data.level >= 20) perks.push('💎 Veteran Server milestone');
    if (data.level >= 25) perks.push('⚡ 10% Server XP boost');
    if (data.level >= 30) perks.push('🎯 6 daily quests');
    if (data.level >= 40) perks.push('🏆 Elite Server milestone');
    if (data.level >= 50) perks.push('👑 Legendary Server milestone');

    const embed = createEmbed({
      title: `📈 ${interaction.guild.name} Progression`,
      description: `**Level ${data.level}**\n` +
        `**${data.xp.toLocaleString()} XP** · ${progress.progressXp.toLocaleString()}/${progress.neededXp.toLocaleString()} XP to Level ${data.level + 1}\n\n` +
        `▰`.repeat(Math.max(0, Math.min(10, Math.round(progress.percent / 10)))) +
        `▱`.repeat(Math.max(0, 10 - Math.min(10, Math.round(progress.percent / 10)))) +
        ` ${progress.percent}%`,
      color: 'primary',
      fields: [
        { name: '🔥 Daily Quests', value: questLines.join('\n').slice(0, 1024) || 'No quests available.', inline: false },
        { name: '💬 Total Messages', value: data.totalMessages.toLocaleString(), inline: true },
        { name: '🤖 Bot Commands', value: data.totalCommands.toLocaleString(), inline: true },
        { name: '✨ Unlocked Perks', value: perks.join('\n') || 'Keep leveling to unlock server perks!', inline: false },
      ],
      footer: subcommand === 'quests' ? 'Daily quests reset every day.' : 'Level up to unlock server-wide progression perks.',
    });

    if (subcommand === 'quests') {
      embed.setTitle(`🔥 ${interaction.guild.name} — Daily Quests`);
    }

    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  },
};
