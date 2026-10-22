import { PermissionFlagsBits } from 'discord.js';

// Multiple default_member_permissions bits must ALL be held, not just one.
const LABELS = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ModerateMembers, 'Moderate Members'],
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone'],
];

export function formatDefaultMemberPermissions(input) {
  if (input == null) return 'Everyone';

  try {
    const value = BigInt(input);
    if (value === 0n) return 'Server administrators';
    if (value < 0n) return 'Restricted';
    const names = LABELS.filter(([flag]) => (value & flag) === flag).map(([, label]) => label);
    const represented = LABELS.reduce((sum, [flag]) => sum | flag, 0n);
    if ((value & ~represented) !== 0n) names.push('other required permissions');
    return names.length ? names.join(' and ') : 'Restricted';
  } catch {
    return 'Restricted';
  }
}
