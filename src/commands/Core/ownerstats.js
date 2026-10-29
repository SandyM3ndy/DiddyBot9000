import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { getRegisteredCommandCount } from '../../utils/commandCounts.js';
import { isPrimaryBotOwner } from '../../config/bot.js';
import announcement from './announcement.js';
import giveexp from './giveexp.js';
import removeexp from './removeexp.js';
import removeleaderboard from './removeleaderboard.js';
import restoreleaderboard from './restoreleaderboard.js';
import progressionexport from './progressionexport.js';

// Keep the established owner-only handlers and their validation/storage intact.
// They are subcommands now, not six competing slash-command entry points.
export const OWNER_OPERATIONS = Object.freeze({
 announcement, giveexp, removeexp, exclude:removeleaderboard,
 restore:restoreleaderboard, export:progressionexport,
});

export default {
  data: new SlashCommandBuilder()
    .setName('ownerstats')
    .setDescription('Beacon creator operations: health, progression backups, XP and broadcasts')
    .addSubcommand(s=>s.setName('overview').setDescription('Private platform overview'))
    .addSubcommand(s=>s.setName('announcement').setDescription('Send a Beacon update to subscribed channels')
      .addStringOption(o=>o.setName('title').setDescription('Announcement title').setRequired(true).setMaxLength(150))
      .addStringOption(o=>o.setName('message').setDescription('Announcement message').setRequired(true).setMaxLength(1800)))
    .addSubcommand(s=>s.setName('giveexp').setDescription('Grant server XP (creator only)')
      .addStringOption(o=>o.setName('server_id').setDescription('Server ID').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('XP to grant').setRequired(true).setMinValue(1).setMaxValue(1000000000)))
    .addSubcommand(s=>s.setName('removeexp').setDescription('Remove server XP (creator only)')
      .addStringOption(o=>o.setName('server_id').setDescription('Server ID').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('XP to remove').setRequired(true).setMinValue(1).setMaxValue(1000000000)))
    .addSubcommand(s=>s.setName('exclude').setDescription('Exclude a server from global progression rankings')
      .addStringOption(o=>o.setName('server_id').setDescription('Server ID').setRequired(true)))
    .addSubcommand(s=>s.setName('restore').setDescription('Restore a server to progression rankings')
      .addStringOption(o=>o.setName('server_id').setDescription('Server ID').setRequired(true)))
    .addSubcommand(s=>s.setName('export').setDescription('Export the saved progression and founders registry')),
  category: 'BotOwner',
  async execute(interaction) {
    if (!isPrimaryBotOwner(interaction.user.id)) {
      return InteractionHelper.safeReply(interaction, {
        content: 'This dashboard is reserved for the primary Beacon owner.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const action=interaction.options?.getSubcommand?.(false)||'overview';
    if(action!=='overview'){
      const operation=OWNER_OPERATIONS[action];
      if(!operation)return InteractionHelper.safeReply(interaction,{
        content:'Unknown owner operation. Reopen /ownerstats.',flags:MessageFlags.Ephemeral});
      return operation.execute(interaction);
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
        { name: '📢 Broadcasts', value: 'Use /ownerstats announcement for subscribed update channels.', inline: false },
        { name: '🛠️ Management', value: '/ownerstats giveexp • removeexp • exclude • restore • export\n/restart remains separate for emergency recovery.', inline: false },
      ],
      footer: 'Beacon • Owner Only • Private report',
    });
    return InteractionHelper.safeReply(interaction, { embeds: [stats], flags: MessageFlags.Ephemeral });
  },
};
