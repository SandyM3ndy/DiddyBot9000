import { Events, AuditLogEvent } from 'discord.js';
import { isAntiNukeEnabled, findRecentAuditEntry, handleDestructiveAction } from '../services/antinukeService.js';
import { logger } from '../utils/logger.js';

const WEBHOOK_AUDIT_EVENTS = [
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookUpdate,
  AuditLogEvent.WebhookDelete,
];

export default {
  name: Events.WebhooksUpdate,
  once: false,
  async execute(channel) {
    try {
      if (!channel.guild || !isAntiNukeEnabled(channel.guild.id)) return;
      for (const type of WEBHOOK_AUDIT_EVENTS) {
        const entry = await findRecentAuditEntry(channel.guild, type, null, 3_000);
        if (!entry?.executor) continue;
        await handleDestructiveAction(channel.guild, entry.executor, 'webhook change', 'channel=' + (channel.name || channel.id));
        return;
      }
    } catch (error) {
      logger.error('Error in webhooksUpdate Anti-Nuke event:', error);
    }
  },
};
