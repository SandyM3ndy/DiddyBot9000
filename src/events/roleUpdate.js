import { Events } from 'discord.js';
import {
  isAntiNukeEnabled,
  isDangerousPermissionChange,
  getDangerousPermissions,
  findRoleUpdateExecutor,
  isTrustedActor,
  revertRolePermissions,
  recordThreat,
  getAntiNukeLevel,
} from '../services/antinukeService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildRoleUpdate,
  once: false,

  async execute(oldRole, newRole) {
    try {
      if (!newRole.guild) return;

      if (!isAntiNukeEnabled(newRole.guild.id)) {
        return;
      }

      const dangerousChange = isDangerousPermissionChange(
        oldRole.permissions,
        newRole.permissions
      );

      if (!dangerousChange) {
        return;
      }

      const dangerousPermissions = getDangerousPermissions(
        oldRole.permissions,
        newRole.permissions
      );

      const auditEntry = await findRoleUpdateExecutor(
        newRole.guild,
        newRole.id
      );

      const executor = auditEntry?.executor;

      recordThreat(newRole.guild.id);

      logger.warn(
        `Anti-Nuke detected dangerous permission change in ${newRole.guild.name}: role=${newRole.name} level=${getAntiNukeLevel(newRole.guild.id)} executor=${executor?.tag || 'Unknown'} permissions=${dangerousPermissions.join(', ')}`
      );

      // We cannot safely attribute the change without an audit-log entry.
      // Don't automatically revert if Discord hasn't identified the actor.
      if (!executor) {
        return;
      }

      if (isTrustedActor(newRole.guild, executor.id)) {
        return;
      }

      await revertRolePermissions(
        newRole,
        oldRole.permissions
      );

    } catch (error) {
      logger.error('Error in roleUpdate Anti-Nuke event:', error);
    }
  },
};
