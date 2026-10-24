import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { getRegisteredCommandCount } from '../../utils/commandCounts.js';
import { isPrimaryBotOwner } from '../../config/bot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ownerstats')
    .setDescription('Bot Owner Only • View Beacon global reach and command statistics'),
  category: 'BotOwner',
  async execute(interaction) {
    if (!isPrimaryBotOwner(interaction.user.id)) {
      return InteractionHelper.safeReply(interaction, {
        content: 'This dashboard is reserved for the primary Beacon owner.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const guilds = [...interaction.client.guilds.cache.values()];
    const sum = pick => guilds.reduce((total, guild) => total + (Number(pick(guild)) || 0), 0);
    const members = sum(guild => guild.memberCount);
    const publicCommandCount = getRegisteredCommandCount(interaction.client);
    const stats = createEmbed({
      title: '👑 Beacon • Owner Operations',
      description: '**Private platform overview**\nLive statistics from all currently connected Beacon servers.',
      color: 'primary',
      fields: [
        { name: '🌐 Servers', value: guilds.length.toLocaleString('en-AU'), inline: true },
        { name: '👥 Members (estimated)', value: members.toLocaleString('en-AU'), inline: true },
        { name: '📚 Slash Commands', value: String(publicCommandCount), inline: true },
        { name: '📝 Channels', value: sum(guild => guild.channels?.cache?.size).toLocaleString('en-AU'), inline: true },
        { name: '🎭 Roles', value: sum(guild => guild.roles?.cache?.size).toLocaleString('en-AU'), inline: true },
        { name: '⏱️ Process Uptime', value: Math.floor(process.uptime() / 3600) + ' hours', inline: true },
        { name: '📢 Broadcasts', value: 'Use /announcement to notify subscribed servers only.', inline: false },
        { name: '🛠️ Management', value: '/restart • /giveexp • /removeexp • /removeleaderboard • /restoreleaderboard', inline: false },
      ],
      footer: 'Beacon • Owner Only • Private report',
    });
    return InteractionHelper.safeReply(interaction, { embeds: [stats], flags: MessageFlags.Ephemeral });
  },
};
