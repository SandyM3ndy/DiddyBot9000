import { PermissionFlagsBits as P } from 'discord.js';
import { DANGEROUS_PERMISSIONS } from '../services/antinukeService.js';

const LABELS = new Map([
  [P.Administrator, 'Administrator'],
  [P.ManageGuild, 'Manage Server'],
  [P.ManageRoles, 'Manage Roles'],
  [P.ManageChannels, 'Manage Channels'],
  [P.ManageWebhooks, 'Manage Webhooks'],
  [P.BanMembers, 'Ban Members'],
  [P.KickMembers, 'Kick Members'],
  [P.ManageMessages, 'Manage Messages'],
  [P.MentionEveryone, 'Mention Everyone'],
]);
const ORDER = { critical: 0, high: 1, review: 2 };

// No moderation actions here: the audit only classifies roles by current bits.
export function auditDangerousRoles(roles) {
  const results = [];
  for (const role of roles || []) {
    const flags = DANGEROUS_PERMISSIONS.filter(bit => role.permissions?.has(bit));
    if (!flags.length) continue;
    const critical = flags.includes(P.Administrator);
    const high = flags.includes(P.ManageGuild) || flags.includes(P.ManageRoles) || flags.includes(P.ManageWebhooks);
    results.push({
      id: role.id,
      name: String(role.name || 'Unnamed role').slice(0, 55),
      managed: role.managed === true,
      everyone: role.guild?.id === role.id,
      severity: critical ? 'critical' : high ? 'high' : 'review',
      permissions: flags.map(bit => LABELS.get(bit) || 'Sensitive permission'),
      position: role.position ?? 0,
    });
  }
  return results.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.permissions.length - a.permissions.length || b.position - a.position);
}
