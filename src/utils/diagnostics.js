import { PermissionFlagsBits as P } from 'discord.js';

// Checks only cached Discord data. A cache miss is "unverified", not "deleted".
export function diagnoseGuild(guild, config = {}, botMember) {
  const findings = [];
  const add = (severity, subject, detail) => findings.push({ severity, subject, detail });
  if (!botMember) {
    add('critical', 'Bot membership', 'Unable to inspect Beacon permissions.');
    return findings;
  }

  for (const [bit, name] of [
    [P.ViewChannel, 'View Channels'],
    [P.SendMessages, 'Send Messages'],
    [P.EmbedLinks, 'Embed Links'],
  ]) {
    if (!botMember.permissions || !botMember.permissions.has(bit)) {
      add('warning', name, 'Not granted server-wide. A channel override might still allow it.');
    }
  }

  function channel(label, channelId, isCategory = false) {
    if (!channelId) return;
    const target = guild.channels?.cache?.get(channelId);
    if (!target) {
      add('unverified', label, 'Not cached. Check whether the configured channel still exists.');
      return;
    }
    if (isCategory) {
      if (target.type !== 4) add('critical', label, 'This must be a category channel.');
      return;
    }
    const perms = target.permissionsFor?.(botMember);
    if (!perms) {
      add('unverified', label, 'Unable to inspect channel permissions.');
      return;
    }
    const missing = [
      [P.ViewChannel, 'View Channel'],
      [P.SendMessages, 'Send Messages'],
      [P.EmbedLinks, 'Embed Links'],
    ].filter(([bit]) => !perms.has(bit)).map(([, name]) => name);
    if (missing.length) add('critical', label, 'Missing: ' + missing.join(', '));
  }

  function role(label, roleId, assignable = false) {
    if (!roleId) return;
    const target = guild.roles?.cache?.get(roleId);
    if (!target) {
      add('unverified', label, 'Not cached. Check whether the configured role still exists.');
      return;
    }
    if (assignable && !botMember.permissions?.has(P.ManageRoles)) {
      add('critical', label, 'Beacon needs Manage Roles to assign this role.');
    } else if (assignable && target.position >= (botMember.roles?.highest?.position ?? -1)) {
      add('critical', label, 'Move the Beacon role above this role.');
    }
  }

  role('Moderator role', config.modRole);
  role('Ticket staff role', config.ticketStaffRoleId);
  role('Auto role', config.autoRole, Boolean(config.autoRole));
  role('Verification role', config.verification?.roleId, config.verification?.enabled === true);

  channel('Welcome', config.welcomeChannel);
  if (config.logging?.enabled === true) {
    if (!config.logging?.channels?.audit) add('warning', 'Audit logs', 'Logging enabled but no audit channel is configured.');
    channel('Audit logs', config.logging?.channels?.audit);
  }
  if (config.verification?.enabled === true) {
    if (!config.verification?.channelId) add('warning', 'Verification', 'Enabled but no verification channel is configured.');
    channel('Verification', config.verification?.channelId);
  }
  channel('Ticket panel', config.ticketPanelChannelId);
  channel('Ticket logs', config.ticketLogsChannelId);
  channel('Ticket transcripts', config.ticketTranscriptChannelId);
  channel('Open tickets category', config.ticketCategoryId, true);
  channel('Closed tickets category', config.ticketClosedCategoryId, true);
  channel('Update announcements', config.updates?.channelId);
  if (!findings.length) add('ok', 'Configuration', 'No problems found in the checked settings.');
  return findings;
}
