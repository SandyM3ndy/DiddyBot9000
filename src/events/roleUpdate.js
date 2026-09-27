import { Events } from 'discord.js';
import {
  isAntiNukeEnabled,
  isDangerousPermissionChange,
  getDangerousPermissions,
  findRoleUpdateExecutor,
  isTrustedActor,
  revertRolePermissions,
  getAntiNukeLevel,
  handleDestructiveAction,
} from '../services/antinukeService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildRoleUpdate,
  once: false,

  async execute(oldRole, newRole) {
    try {
      if (!newRole.guild || !isAntiNukeEnabled(newRole.guild.id)) return;
      if (!isDangerousPermissionChange(oldRole.permissions, newRole.permissions)) return;

      const dangerousPermissions = getDangerousPermissions(
        oldRole.permissions,
        newRole.permissions
      );

      const auditEntry = await findRoleUpdateExecutor(newRole.guild, newRole.id);
      const executor = auditEntry?.executor;
\n
      logger.warn(
        `Anti-Nuke detected dangerous permission change in ${newRole.guild.name}: role=${newRole.name} level=${getAntiNukeLevel(newRole.guild.id)} executor=${executor?.tag || 'Unknown'} permissions=${dangerousPermissions.join(', ')}`
      );

      if (!executor || isTrustedActor(newRole.guild, executor.id)) return;

      await revertRolePermissions(newRole, oldRole.permissions);
      await handleDestructiveAction(
        newRole.guild,
        executor,
        'dangerous role permission escalation',
        `role=${newRole.name}`
      );
    } catch (error) {
      logger.error('Error in roleUpdate Anti-Nuke event:', error);
    }
  },
};
