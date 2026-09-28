import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { logModerationAction } from '../utils/moderation.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { analyzeAntiNukeBehavior, clearAntiNukeAIData } from './aiSecurityService.js';

const configurations = new Map();
const recentActions = new Map();
const punishedActors = new Set();

export const ANTINUKE_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  MAXIMUM: 'maximum',
};

const THRESHOLDS = {
  [ANTINUKE_LEVELS.LOW]: 8,
  [ANTINUKE_LEVELS.MEDIUM]: 5,
  [ANTINUKE_LEVELS.HIGH]: 3,
  [ANTINUKE_LEVELS.MAXIMUM]: 2,
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



export async function loadPersistedAntiNukeConfig(client, guildId) {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    const persisted = guildConfig?.antiNuke;
    if (!persisted || typeof persisted !== 'object') return getAntiNukeConfig(guildId);

    setAntiNukeConfig(guildId, {
      enabled: persisted.enabled === true,
      level: THRESHOLDS[persisted.level] !== undefined ? persisted.level : ANTINUKE_LEVELS.MEDIUM,
    });
    return getAntiNukeConfig(guildId);
  } catch (error) {
    logger.error('Failed to load Anti-Nuke config for guild ' + guildId + ':', error);
    return getAntiNukeConfig(guildId);
  }
}

export async function savePersistedAntiNukeConfig(client, guildId) {
  try {
    const current = getAntiNukeConfig(guildId);
    const existing = await getGuildConfig(client, guildId);
    await setGuildConfig(client, guildId, {
      ...existing,
      antiNuke: { enabled: current.enabled, level: current.level },
    });
    return true;
  } catch (error) {
    logger.error('Failed to save Anti-Nuke config for guild ' + guildId + ':', error);
    return false;
  }
}

export async function loadAllPersistedAntiNukeConfigs(client) {
  for (const guild of client.guilds.cache.values()) {
    await loadPersistedAntiNukeConfig(client, guild.id);
  }
}

export function isAntiNukeEnabled(guildId) {
  return getAntiNukeConfig(guildId).enabled === true;
}

export function getAntiNukeLevel(guildId) {
  return getAntiNukeConfig(guildId).level;
}

export function getThreshold(level = ANTINUKE_LEVELS.MEDIUM) {
  return THRESHOLDS[level] ?? THRESHOLDS[ANTINUKE_LEVELS.MEDIUM];
}

export function recordThreat(guildId) {
  const config = getAntiNukeConfig(guildId);
  configurations.set(guildId, {
    ...config,
    threats: config.threats + 1,
    lastIncident: Date.now(),
  });
}

export function recordBlockedAction(guildId, amount = 1) {
  const config = getAntiNukeConfig(guildId);
  configurations.set(guildId, {
    ...config,
    blockedActions: config.blockedActions + amount,
    lastIncident: Date.now(),
  });
}

export function isDangerousPermissionChange(oldPermissions, newPermissions) {
  return DANGEROUS_PERMISSIONS.some(
    (permission) => !oldPermissions.has(permission) && newPermissions.has(permission)
  );
}

export function getDangerousPermissions(oldPermissions, newPermissions) {
  return DANGEROUS_PERMISSIONS.filter(
    (permission) => !oldPermissions.has(permission) && newPermissions.has(permission)
  );
}

export function isTrustedActor(guild, userId) {
  return Boolean(userId && guild.ownerId === userId);
}

export async function findRecentAuditEntry(guild, type, targetId = null, maxAge = 10_000) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 10 });
    const now = Date.now();

    return logs.entries.find((entry) => {
      if (now - entry.createdTimestamp > maxAge) return false;
      if (targetId && entry.target?.id !== targetId) return false;
      return Boolean(entry.executor?.id);
    }) || null;
  } catch (error) {
    logger.error(`Failed to fetch audit logs for ${guild.id}:`, error);
    return null;
  }
}

export const findRoleUpdateExecutor = (guild, roleId) =>
  findRecentAuditEntry(guild, AuditLogEvent.RoleUpdate, roleId);

export function trackAction(guildId, userId, action) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const actions = recentActions.get(key) || [];

  actions.push({ action, timestamp: now });

  const recent = actions.filter((entry) => now - entry.timestamp <= 10_000);
  recentActions.set(key, recent);
  return recent;
}

export function registerSecurityAction(guildId, userId, action) {
  const actions = trackAction(guildId, userId, action);
  const threshold = getThreshold(getAntiNukeLevel(guildId));

  return {
    actions,
    count: actions.length,
    threshold,
    triggered: actions.length >= threshold,
  };
}

export function isRapidActivity(guildId, userId, threshold = 5) {
  return trackAction(guildId, userId, 'security_action').length >= threshold;
}

export async function punishExecutor(guild, executor, reason = 'Anti-Nuke: destructive activity detected', action = 'destructive activity') {
  if (!executor?.id || isTrustedActor(guild, executor.id)) return false;

  const key = `${guild.id}:${executor.id}`;
  if (punishedActors.has(key)) return false;

  const member = guild.members.cache.get(executor.id) ||
    await guild.members.fetch(executor.id).catch(() => null);

  if (!member || member.id === guild.ownerId || !member.kickable) return false;

  punishedActors.add(key);

  try {
    await member.kick(reason);
    recordBlockedAction(guild.id);

    try {
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Kicked',
          target: `${executor.tag || 'Unknown User'} (${executor.id})`,
          executor: `${guild.client.user?.tag || 'DiddyBot9000'} (${guild.client.user?.id || 'Unknown'})`,
          reason,
          metadata: {
            userId: executor.id,
            moderatorId: guild.client.user?.id,
            source: 'Anti-Nuke',
            antiNuke: true,
            action,
          }
        }
      });

      logger.warn(`Anti-Nuke kicked ${executor.tag || executor.id} in ${guild.name}: ${reason} (Case #${caseId})`);
    } catch (caseError) {
      logger.error(`Anti-Nuke kicked ${executor.tag || executor.id}, but failed to create moderation case:`, caseError);
    }

    return true;
  } catch (error) {
    punishedActors.delete(key);
    logger.error(`Anti-Nuke failed to kick ${executor.tag || executor.id} in ${guild.name}:`, error);
    return false;
  }
}

export async function handleDestructiveAction(guild, executor, action, details = '') {
  if (!isAntiNukeEnabled(guild.id) || !executor?.id) {
    return { detected: false, triggered: false };
  }

  if (isTrustedActor(guild, executor.id)) {
    return { detected: false, trusted: true, triggered: false };
  }

  recordThreat(guild.id);
  const result = registerSecurityAction(guild.id, executor.id, action);

  const ai = await analyzeAntiNukeBehavior({
    guild,
    executor,
    action,
    details,
    recentActions: result.actions,
    threshold: result.threshold,
  });

  logger.warn(
    `Anti-Nuke detected ${action} in ${guild.name}: executor=${executor.tag || executor.id}, count=${result.count}/${result.threshold}${details ? `, details=${details}` : ''}${ai ? `, aiRisk=${ai.riskScore}/100, aiSource=${ai.source}` : ''}`
  );

  const aiShouldProtect = Boolean(
    ai &&
    ai.riskScore >= 92 &&
    ai.confidence >= 0.8 &&
    ['high', 'critical'].includes(ai.severity) &&
    ['protect', 'kick'].includes(ai.recommendation)
  );

  if (result.triggered || aiShouldProtect) {
    const punishmentReason = result.triggered
      ? `Anti-Nuke: ${action} threshold exceeded (${result.count} actions in 10 seconds)`
      : `Anti-Nuke AI: critical destructive behavior detected (risk ${ai.riskScore}/100, confidence ${Math.round(ai.confidence * 100)}%)`;

    const punished = await punishExecutor(
      guild,
      executor,
      punishmentReason,
      action
    );

    return {
      detected: true,
      triggered: true,
      ai,
      aiTriggered: aiShouldProtect,
      punished,
      ...result,
    };
  }

  return { detected: true, triggered: false, ai, aiTriggered: false, ...result };
}

export async function revertRolePermissions(role, oldPermissions) {
  try {
    await role.setPermissions(
      oldPermissions,
      'Anti-Nuke: reverted dangerous permission escalation'
    );
    recordBlockedAction(role.guild.id);
    logger.warn(
      `Anti-Nuke reverted dangerous permissions on role ${role.name} (${role.id}) in ${role.guild.name}`
    );
    return true;
  } catch (error) {
    logger.error(`Anti-Nuke failed to revert permissions on role ${role.name}:`, error);
    return false;
  }
}

export function clearAntiNukeData(guildId) {
  configurations.delete(guildId);
  punishedActors.forEach((key) => {
    if (key.startsWith(`${guildId}:`)) punishedActors.delete(key);
  });
  clearAntiNukeAIData(guildId);
  for (const key of recentActions.keys()) {
    if (key.startsWith(`${guildId}:`)) recentActions.delete(key);
  }
}
