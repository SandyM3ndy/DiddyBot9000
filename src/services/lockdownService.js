import { PermissionFlagsBits } from 'discord.js';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

const STATE_PREFIX = 'guild:';
const STATE_SUFFIX = ':lockdown_state';
const PASSWORD_HASH = 'b0eb0645967165e1bbd9a3608d039eea430c918316f7e93b1cf6f5c9e80bc977';

const LOCKDOWN_DENIED_FLAGS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.UseExternalStickers,
  PermissionFlagsBits.UseApplicationCommands,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseEmbeddedActivities,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.UseExternalSounds,
  PermissionFlagsBits.RequestToSpeak,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.CreateInstantInvite,
];

function stateKey(guildId) {
  return `${STATE_PREFIX}${guildId}${STATE_SUFFIX}`;
}

function hashConfirmation(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function verifyLockdownConfirmation(value) {
  return hashConfirmation(value) === PASSWORD_HASH;
}

export function isLockdownActive(client, guildId) {
  return Boolean(client.lockdownStates?.get(guildId));
}

export async function loadLockdownStates(client) {
  if (!client.lockdownStates) {
    client.lockdownStates = new Map();
  }

  for (const guild of client.guilds.cache.values()) {
    try {
      const state = await client.db?.get?.(stateKey(guild.id), null);
      if (state?.active) {
        client.lockdownStates.set(guild.id, true);
        logger.warn(`Loaded active server lockdown for ${guild.name} (${guild.id})`);
      }
    } catch (error) {
      logger.error(`Failed to load lockdown state for guild ${guild.id}:`, error);
    }
  }
}

function serializeOverwrite(overwrite) {
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  };
}

async function snapshotGuild(guild) {
  const roles = [];
  for (const role of guild.roles.cache.values()) {
    if (!role.editable) {
      continue;
    }

    roles.push({
      id: role.id,
      permissions: role.permissions.bitfield.toString(),
    });
  }

  const channels = [];
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) {
      continue;
    }

    channels.push({
      id: channel.id,
      overwrites: channel.permissionOverwrites.cache.map(serializeOverwrite),
    });
  }

  return {
    active: false,
    createdAt: Date.now(),
    roles,
    channels,
  };
}

function addDeniedPermissions(overwrite, preserve = false) {
  if (preserve) {
    return overwrite;
  }

  const deny = new Set(overwrite.deny.toArray());
  for (const flag of LOCKDOWN_DENIED_FLAGS) {
    deny.add(flag);
  }

  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: PermissionFlagsBits ? Array.from(deny) : overwrite.deny.bitfield.toString(),
  };
}

function buildDenyOverwrite(overwrite) {
  const deny = new Set(overwrite.deny.toArray());
  for (const flag of LOCKDOWN_DENIED_FLAGS) {
    deny.add(flag);
  }

  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: deny.size ? deny : [],
  };
}

export async function activateLockdown(client, guild) {
  if (isLockdownActive(client, guild.id)) {
    return { success: false, reason: 'already_active' };
  }

  const snapshot = await snapshotGuild(guild);
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

  if (!botMember) {
    throw new Error('Could not resolve DiddyBot member in the guild.');
  }

  await client.db.set(stateKey(guild.id), { ...snapshot, active: true });

  try {
    let rolesLocked = 0;
    let channelsLocked = 0;
    const skippedRoles = [];

    for (const role of guild.roles.cache.values()) {
      if (!role.editable || role.managed) {
        continue;
      }

      if (role.id === botMember.roles.highest.id) {
        continue;
      }

      try {
        await role.setPermissions(0n, 'Emergency server lockdown');
        rolesLocked += 1;
      } catch (error) {
        skippedRoles.push({ id: role.id, name: role.name, error: error.message });
        logger.warn(`Could not strip permissions from role ${role.name} in ${guild.name}: ${error.message}`);
      }
    }

    for (const channel of guild.channels.cache.values()) {
      if (!channel.permissionOverwrites?.cache) {
        continue;
      }

      const overwrites = channel.permissionOverwrites.cache.map((overwrite) => {
        const preserve =
          overwrite.id === guild.ownerId ||
          overwrite.id === botMember.id ||
          (overwrite.type === 0 && botMember.roles.cache.has(overwrite.id));

        return preserve ? serializeOverwrite(overwrite) : buildDenyOverwrite(overwrite);
      });

      try {
        await channel.permissionOverwrites.set(
          overwrites.map((overwrite) => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow,
            deny: overwrite.deny,
          })),
          'Emergency server lockdown',
        );
        channelsLocked += 1;
      } catch (error) {
        logger.warn(`Could not lock channel ${channel.id} (${channel.name ?? 'unnamed'}) in ${guild.name}: ${error.message}`);
      }
    }

    // Discord has no "pause invites" switch. Revoking active invites is the
    // reliable way to prevent existing invite links from being used.
    let invitesRevoked = 0;
    try {
      const invites = await guild.invites.fetch();
      for (const invite of invites.values()) {
        try {
          await invite.delete('Emergency server lockdown');
          invitesRevoked += 1;
        } catch (error) {
          logger.warn(`Could not revoke invite ${invite.code} in ${guild.name}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.warn(`Could not fetch server invites during lockdown for ${guild.name}: ${error.message}`);
    }

    client.lockdownStates.set(guild.id, true);

    return {
      success: true,
      rolesLocked,
      channelsLocked,
      invitesRevoked,
      skippedRoles,
    };
  } catch (error) {
    try {
      await restoreLockdown(client, guild);
    } catch (restoreError) {
      logger.error(`Lockdown failed and automatic restoration also failed for ${guild.name}:`, restoreError);
    }
    throw error;
  }
}

export async function restoreLockdown(client, guild) {
  const state = await client.db?.get?.(stateKey(guild.id), null);
  if (!state?.active) {
    client.lockdownStates?.set(guild.id, false);
    return { success: false, reason: 'not_active' };
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

  for (const roleState of state.roles ?? []) {
    const role = guild.roles.cache.get(roleState.id);
    if (!role || !role.editable || role.managed || role.id === botMember?.roles?.highest?.id) {
      continue;
    }

    try {
      await role.setPermissions(BigInt(roleState.permissions), 'Restore after emergency server lockdown');
    } catch (error) {
      logger.warn(`Could not restore role ${role.name}: ${error.message}`);
    }
  }

  for (const channelState of state.channels ?? []) {
    const channel = guild.channels.cache.get(channelState.id);
    if (!channel?.permissionOverwrites) {
      continue;
    }

    try {
      await channel.permissionOverwrites.set(
        (channelState.overwrites ?? []).map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow,
          deny: overwrite.deny,
        })),
        'Restore after emergency server lockdown',
      );
    } catch (error) {
      logger.warn(`Could not restore channel ${channel.name ?? channel.id}: ${error.message}`);
    }
  }

  await client.db.delete(stateKey(guild.id));
  client.lockdownStates?.set(guild.id, false);

  return { success: true };
}
