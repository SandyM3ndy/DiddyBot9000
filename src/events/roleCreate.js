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
  name: Events.GuildRoleCreate,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      const lines = buildRoleAuditLines(role);

      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_CREATE,
        data: {
          title: 'Role Created',
          headline: `${role.toString()} was created`,
          lines,
        },
      });

      if (!isAntiNukeEnabled(role.guild.id)) return;

      const auditEntry = await findRecentAuditEntry(
        role.guild,
        AuditLogEvent.RoleCreate,
        role.id
      );

      await handleDestructiveAction(
        role.guild,
        auditEntry?.executor,
        'role creation',
        `role=${role.name}`
      );
    } catch (error) {
      logger.error('Error in roleCreate event:', error);
    }
  },
};
