/**
 * Command category metadata for Beacon's command access manager.
 */

export const CATEGORY_ICONS = {
  Community: '👥',
  Core: 'ℹ️',
  BotOwner: '👑',
  Fun: '🎮',
  Giveaway: '🎉',
  JoinToCreate: '🔌',
  Logging: '📝',
  Moderation: '🛡️',
  Music: '🎵',
  Reaction_roles: '🎭',
  Search: '🔍',
  ServerStats: '📈',
  Ticket: '🎫',
  Tools: '🛠️',
  Utility: '🔧',
  Verification: '✅',
  Welcome: '👋',
};

/** Commands that always stay available so server admins can recover access. */
export const OWNER_ONLY_COMMANDS = new Set([
  'announcement', 'broadcast', 'giveexp', 'removeexp',
  'removeleaderboard', 'restoreleaderboard', 'popularity', 'restart',
]);
export const PROTECTED_COMMANDS = new Set(['dashboard', 'antinuke', ...OWNER_ONLY_COMMANDS]);
export function isOwnerOnlyCommand(name) {
  return OWNER_ONLY_COMMANDS.has(String(name || '').toLowerCase());
}

export function normalizeCategoryKey(category) {
  return String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function formatCategoryName(rawCategory) {
  return String(rawCategory || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS[formatCategoryName(category)] || '📁';
}
