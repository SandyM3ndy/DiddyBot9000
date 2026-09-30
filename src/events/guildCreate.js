import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';
import { registerGuildCommands } from '../handlers/loaders/commandLoader.js';

export default {
  name: Events.GuildCreate,
  async execute(guild, client) {
    try {
      logger.info('Bot joined guild', {
        event: 'guild.create',
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
      });

      const config = await getGuildConfig(client, guild.id);
      await setGuildConfig(client, guild.id, config);

      // Register commands immediately for newly joined servers. This avoids
      // waiting for Discord's global command propagation or a manual sync.
      try {
        await registerGuildCommands(client, guild.id, {
          clientId: client.config?.bot?.clientId,
        });
        logger.info(`Beacon commands are ready immediately in ${guild.name}`);
      } catch (error) {
        logger.error(`Failed to register commands in newly joined guild ${guild.id}:`, error);
      }

      // Welcome the server owner directly when possible.
      try {
        const owner = await guild.fetchOwner();
        await owner.send(
          '👋 **Welcome to Beacon!**\n\n' +
          'The whole development team behind **Beacon** is extremely happy that you chose Beacon as one of the bots in **' + guild.name + '**. Thank you for trusting us to be part of your community!\n\n' +
          'Beacon was built to give communities powerful moderation, security, staff tools, tickets, progression, and more — all in one place. We hope it makes running your server a little easier and a lot more enjoyable.\n\n' +
          '🚀 **Beacon v1.0** is only the beginning. We have plenty more planned, and we are excited to keep improving Beacon alongside the communities that use it.\n\n' +
          '*Your community\'s all-in-one Discord assistant.*'
        );
        logger.info('Sent Beacon welcome DM to the owner of ' + guild.name);
      } catch (error) {
        logger.warn('Could not DM the owner of ' + guild.name + ' after bot join: ' + error.message);
      }
    } catch (error) {
      logger.error(`Error initializing guild ${guild?.id} on join:`, error);
    }
  },
};
