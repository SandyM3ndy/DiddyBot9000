import {
  AuditLogEvent,
  PermissionFlagsBits,
} from 'discord.js';
import { logger } from '../utils/logger.js';

const configurations = new Map();
const recentActions = new Map();

export const ANTINUKE_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  MAXIMUM: 'maximum',
};

export const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
];

export function getAntiNukeConfig(guildId) {
  return configurations.get(guildId) || {
    enabled: false,
    level: ANTINUKE_LEVELS.MEDIUM,
    blockedActions: 0,
    threats: 0,
    lastIncident: null,
  };
}

export function setAntiNukeConfig(guildId, config) {
  configurations.set(guildId, {
    ...getAntiNukeConfig(guildId),
    ...config,
  });
}

export function isAntiNukeEnabled(guildId) {
  return getAntiNukeConfig(guildId).enabled === true;
}

export function getAntiNukeLevel(guildId) {
  return getAntiNukeConfig(guildId).level;
}

export function recordThreat(guildId) {
  const config = getAntiNukeConfig(guildId);

  configurations.set(guildId, {
    ...config,
    threats: config.threats + 1,
    lastIncident: Date.now(),
  });
}

export function recordBlockedAction(guildId) {
  const config = getAntiNukeConfig(guildId);

  configurations.set(guildId, {
    ...config,
    blockedActions: config.blockedActions + 1,
    lastIncident: Date.now(),
  });
}

export function isDangerousPermissionChange(oldPermissions, newPermissions) {
  return DANGEROUS_PERMISSIONS.some(
    (permission) =>
      !oldPermissions.has(permission) &&
      newPermissions.has(permission)
  );
}

export function getDangerousPermissions(oldPermissions, newPermissions) {
  return DANGEROUS_PERMISSIONS.filter(
    (permission) =>
      !oldPermissions.has(permission) &&
      newPermissions.has(permission)
  );
}

export function isTrustedActor(guild, userId) {
  if (!userId) return false;

  // The server owner is trusted.
  if (guild.ownerId === userId) {
    return true;
  }

  // The bot owner is NOT automatically trusted here.
  // Discord server permissions still determine what the bot can undo.
  return false;
}

export async function findRoleUpdateExecutor(guild, roleId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.RoleUpdate,
      limit: 10,
    });

    const entry = logs.entries.find(
      (entry) =>
        entry.target?.id === roleId &&
        Date.now() - entry.createdTimestamp < 10_000
    );

    return entry || null;
  } catch (error) {
    logger.error('Failed to fetch role update audit logs:', error);
    return null;
  }
}

export function trackAction(guildId, userId, action) {
  const key = `${guildId}:${userId}`;

  if (!recentActions.has(key)) {
    recentActions.set(key, []);
  }

  const actions = recentActions.get(key);
  const now = Date.now();

  actions.push({
    action,
    timestamp: now,
  });

  const recent = actions.filter(
    (entry) => now - entry.timestamp <= 10_000
  );

  recentActions.set(key, recent);

  return recent;
}

export function isRapidActivity(guildId, userId, threshold = 5) {
  const actions = trackAction(guildId, userId, 'security_action');

  return actions.length >= threshold;
}

export async function revertRolePermissions(role, oldPermissions) {
  try {
    await role.setPermissions(oldPermissions, 'Anti-Nuke: reverted dangerous permission escalation');

    recordBlockedAction(role.guild.id);

    logger.warn(
      `Anti-Nuke reverted dangerous permissions on role ${role.name} (${role.id}) in ${role.guild.name}`
    );

    return true;
  } catch (error) {
    logger.error(
      `Anti-Nuke failed to revert permissions on role ${role.name}:`,
      error
    );

    return false;
  }
}

export function clearAntiNukeData(guildId) {
  configurations.delete(guildId);

  for (const key of recentActions.keys()) {
    if (key.startsWith(`${guildId}:`)) {
      recentActions.delete(key);
    }
  }
}
