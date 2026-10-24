import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View the server owner, membership, channels, roles and boosts')
    .setDMPermission(false),
  category: 'Utility',

  async execute(interaction) {
    if (!(await InteractionHelper.safeDefer(interaction))) return;
    const guild = interaction.guild;
    if (!guild) return InteractionHelper.safeEditReply(interaction, { content: 'Run this command in a server.' });

    // The owner API request can fail; server information must still work.
    const owner = await guild.fetchOwner().catch(() => null);
    const ownerText = owner?.user?.tag || (guild.ownerId ? '<@' + guild.ownerId + '>' : 'Unavailable');
    const created = Math.floor(guild.createdTimestamp / 1000);
    const thumbnail = guild.iconURL?.({ size: 256 }) || null;
    const embed = createEmbed({
      title: '🏠 Server Information • ' + guild.name,
      description: 'A live snapshot of this Discord community.',
      color: 'primary',
      thumbnail,
      fields: [
        { name: '👑 Owner', value: ownerText, inline: true },
        { name: '👥 Members', value: Number(guild.memberCount || 0).toLocaleString('en-AU'), inline: true },
        { name: '📁 Channels', value: String(guild.channels.cache.size), inline: true },
        { name: '🎭 Roles', value: String(guild.roles.cache.size), inline: true },
        { name: '💎 Boosts', value: 'Level ' + (guild.premiumTier ?? 0) + ' • ' + (guild.premiumSubscriptionCount ?? 0) + ' boosts', inline: true },
        { name: '📅 Created', value: Number.isFinite(created) ? '<t:' + created + ':R>' : 'Unavailable', inline: true },
        { name: '🔎 Server ID', value: String(guild.id), inline: false },
      ],
      footer: 'Beacon • Server Information',
    });
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug('Server information displayed', { guildId: guild.id, userId: interaction.user.id });
  },
};
