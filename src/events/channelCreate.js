import { Events, AuditLogEvent } from 'discord.js';
import { isAntiNukeEnabled, findRecentAuditEntry, handleDestructiveAction } from '../services/antinukeService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ChannelCreate,
  once: false,
  async execute(channel) {
    try {
      if (!channel.guild || !isAntiNukeEnabled(channel.guild.id)) return;
      const entry = await findRecentAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      await handleDestructiveAction(channel.guild, entry?.executor, 'channel creation', 'channel=' + channel.name);
    } catch (error) {
      logger.error('Error in channelCreate Anti-Nuke event:', error);
    }
  },
};
