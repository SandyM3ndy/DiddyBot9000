import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';

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

      // Welcome the server owner directly when possible.
      try {
        const owner = await guild.fetchOwner();
        await owner.send(
          '👋 Hey! SandyMandy is happy that you chose **DiddyBot9000** for its cool commands. Thanks for adding me to **' + guild.name + '**!'
        );
        logger.info('Sent DiddyBot9000 welcome DM to the owner of ' + guild.name);
      } catch (error) {
        logger.warn('Could not DM the owner of ' + guild.name + ' after bot join: ' + error.message);
      }
    } catch (error) {
      logger.error(`Error initializing guild ${guild?.id} on join:`, error);
    }
  },
};
