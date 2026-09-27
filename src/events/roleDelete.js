import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditLines } from '../utils/logging/logEmbeds.js';
import {
  isAntiNukeEnabled,
  findRecentAuditEntry,
  handleDestructiveAction,
} from '../services/antinukeService.js';

export default {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      const lines = buildRoleAuditLines(role, { includeMemberCount: true });

      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_DELETE,
        data: {
          title: 'Role Deleted',
          headline: `**${role.name}** was deleted`,
          lines,
        },
      });

      if (!isAntiNukeEnabled(role.guild.id)) return;

      const auditEntry = await findRecentAuditEntry(
        role.guild,
        AuditLogEvent.RoleDelete,
        role.id
      );

      await handleDestructiveAction(
        role.guild,
        auditEntry?.executor,
        'role deletion',
        `role=${role.name}`
      );
    } catch (error) {
      logger.error('Error in roleDelete event:', error);
    }
  },
};
