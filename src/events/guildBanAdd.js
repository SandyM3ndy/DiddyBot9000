import { Events, AuditLogEvent } from 'discord.js';
import { isAntiNukeEnabled, findRecentAuditEntry, handleDestructiveAction } from '../services/antinukeService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildBanAdd,
  once: false,
  async execute(ban) {
    try {
      if (!ban.guild || !isAntiNukeEnabled(ban.guild.id)) return;
      const entry = await findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      await handleDestructiveAction(ban.guild, entry?.executor, 'member ban', 'target=' + (ban.user.tag || ban.user.id));
    } catch (error) {
      logger.error('Error in guildBanAdd Anti-Nuke event:', error);
    }
  },
};
