import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { botConfig, getColor } from '../config/bot.js';
import { buildGuildJoinFields } from '../utils/guildJoinNotification.js';
import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';

export default {
  name: Events.GuildCreate,
  async execute(guild, client) {
    logger.info('Bot joined guild', {
      event: 'guild.create',
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount,
    });

    // Guild initialization and the two DMs must not depend on one another.
    try {
      const config = await getGuildConfig(client, guild.id);
      await setGuildConfig(client, guild.id, config);
      // Slash commands are registered globally; do not create guild-scoped duplicates.
    } catch (error) {
      logger.error(`Error initializing guild ${guild.id} on join:`, error);
    }

    let serverOwner = null;
    try {
      serverOwner = await guild.fetchOwner();
      await serverOwner.send(
        '👋 **Welcome to Beacon!**\\n\\n' +
          'The whole development team behind **Beacon** is extremely happy that you chose Beacon as one of the bots in **' + guild.name + '**. Thank you for trusting us to be part of your community!\\n\\n' +
          'Beacon was built to give communities powerful moderation, security, staff tools, tickets, progression, and more — all in one place. We hope it makes running your server a little easier and a lot more enjoyable.\\n\\n' +
          '🚀 **Beacon v1.0** is only the beginning. We have plenty more planned, and we are excited to keep improving Beacon alongside the communities that use it.\\n\\n' +
          "*Your community’s all-in-one Discord assistant.*"
      );
      logger.info('Sent Beacon welcome DM to the owner of ' + guild.name);
    } catch (error) {
      logger.warn('Could not DM the owner of ' + guild.name + ' after bot join: ' + error.message);
    }

    // Notify only the primary Beacon owner, not everyone in OWNER_IDS.
    const beaconOwnerId = botConfig.commands?.primaryOwnerId;
    if (!beaconOwnerId) {
      logger.warn('Beacon owner join alert skipped: no primary owner configured.');
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(getColor('success'))
        .setTitle('🚀 Beacon joined a new server')
        .setDescription('Beacon was added to a Discord server. Here are its current stats.')
        .addFields(buildGuildJoinFields(guild, serverOwner, client.guilds.cache.size))
        .setTimestamp();

      const iconUrl = guild.iconURL?.({ size: 128 });
      if (iconUrl) embed.setThumbnail(iconUrl);

      const beaconOwner = await client.users.fetch(beaconOwnerId);
      await beaconOwner.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      logger.info('Sent Beacon guild join DM to primary owner', { guildId: guild.id });
    } catch (error) {
      logger.warn('Could not send primary owner guild join DM for ' + guild.id + ': ' + error.message);
    }
  },
};
