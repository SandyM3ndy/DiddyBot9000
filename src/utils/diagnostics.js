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

  channel('Welcome', config.welcomeChannel || config.channelId || config.welcome?.channelId);
  channel('Goodbye', config.goodbyeChannelId || config.welcome?.goodbyeChannelId);
  if (config.enabled && !(config.welcomeChannel || config.channelId || config.welcome?.channelId)) {
    add('warning', 'Welcome setup', 'Welcome messages enabled without a destination. Open /dashboard → Welcome & Goodbye.');
  }
  if (config.goodbyeEnabled && !config.goodbyeChannelId) {
    add('warning', 'Goodbye setup', 'Goodbye messages enabled without a destination.');
  }
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
  if (config.ticketPanelChannelId && !config.ticketPanelMessageId) {
    add('warning', 'Ticket panel', 'No panel message ID saved. Use /ticket panel to repair or repost.');
  }
  if (config.ticketPanelChannelId && !config.ticketCategoryId) {
    add('warning', 'Ticket routing', 'An open-ticket category is not configured.');
  }
  if (config.ticketPanelChannelId && !config.ticketStaffRoleId) {
    add('warning', 'Ticket support', 'No support staff role configured.');
  }
  if (config.ticketTranscriptChannelId) {
    const archive = guild.channels?.cache?.get(config.ticketTranscriptChannelId);
    const everyone = guild.roles?.everyone;
    if (archive && everyone) {
      const publicAccess = archive.permissionsFor?.(everyone)?.has(P.ViewChannel);
      if (publicAccess === true) {
        add('critical', 'Transcript privacy', 'Archive is visible to @everyone. Restrict View Channel before archiving tickets.');
      } else if (publicAccess === undefined) {
        add('unverified', 'Transcript privacy', 'Could not verify that @everyone cannot view the archive.');
      }
      const botPerms = archive.permissionsFor?.(botMember);
      if (botPerms && !botPerms.has(P.AttachFiles)) {
        add('critical', 'Transcript uploads', 'Beacon requires Attach Files permission in the private archive channel.');
      }
    }
  }
  channel('Open tickets category', config.ticketCategoryId, true);
  channel('Closed tickets category', config.ticketClosedCategoryId, true);
  channel('Update announcements', config.updates?.channelId);
  if (!findings.length) add('ok', 'Configuration', 'No problems found in the checked settings.');
  return findings;
}


/** An advisory score, not a guarantee that every subsystem works.
 * Unverified checks carry a small penalty rather than being treated as failures.
 */
export function calculateServerHealth(findings = []) {
  const actual = findings.filter(f => f.severity !== 'ok');
  const critical = actual.filter(f => f.severity === 'critical').length;
  const warning = actual.filter(f => f.severity === 'warning').length;
  const unverified = actual.filter(f => f.severity === 'unverified').length;
  const score = Math.max(0, 100 - critical * 18 - warning * 7 - unverified * 2);
  const grade = score >= 90 ? 'Excellent' : score >= 75 ? 'Good'
    : score >= 55 ? 'Needs attention' : 'At risk';
  const actions = actual.filter(f => f.severity === 'critical' || f.severity === 'warning')
    .slice(0, 3).map(f => f.subject + ': ' + f.detail);
  return { score, grade, critical, warning, unverified, actions, checked: findings.length };
}


/**
 * Turn configuration findings into precise next steps. Optional features that
 * are not enabled do not become "failures" merely because they are not set up.
 */
export function buildDiagnosticActionPlan(findings = [], limit = 4) {
  const problems = findings.filter(item => item?.severity === 'critical' || item?.severity === 'warning');
  const unique = new Set();
  const actions = [];
  for (const issue of problems) {
    const subject = String(issue.subject || '');
    const detail = String(issue.detail || '');
    let fix;
    if (subject === 'Database') {
      fix = 'Check persistent PostgreSQL connectivity on the Beacon host; do not restart into memory-only mode.';
    } else if (/Transcript privacy/i.test(subject)) {
      fix = 'Make the transcript archive private to staff; deny @everyone View Channel access.';
    } else if (/Transcript uploads/i.test(subject)) {
      fix = 'Give Beacon Attach Files permission in the private transcript archive.';
    } else if (/Ticket/i.test(subject)) {
      fix = 'Open /ticket dashboard and review support channel, categories, staff roles and transcript settings.';
    } else if (/Verification/i.test(subject)) {
      fix = 'Open /verification dashboard; check verification channel, role hierarchy and Beacon permissions.';
    } else if (/Welcome|Goodbye/i.test(subject)) {
      fix = 'Open /dashboard → Welcome & Goodbye and select valid channels and roles.';
    } else if (/Audit|Logging/i.test(subject)) {
      fix = 'Open /dashboard → Logging and choose a channel Beacon can write to.';
    } else if (/role/i.test(subject) || /Manage Roles/i.test(detail)) {
      fix = 'Open /dashboard → Moderator Role; check Manage Roles and move Beacon above assignable roles.';
    } else if (/View Channel|Send Messages|Embed Links|View Channels/i.test(subject)) {
      fix = 'Check Beacon role permissions and channel overrides in Server Settings.';
    } else {
      fix = subject + ': ' + detail;
    }
    if (unique.has(fix)) continue;
    unique.add(fix);
    actions.push(fix);
    if (actions.length >= Math.max(1, limit)) break;
  }
  return actions;
}

export function summarizeConfiguredFeatures(config = {}) {
  const features = [
    ['🛡️ AutoMod', config.autoModEnabled === true],
    ['🏆 Progression', config.serverProgression?.enabled === true],
    ['🎫 Tickets', Boolean(config.ticketPanelChannelId)],
    ['✅ Verification', config.verification?.enabled === true],
    ['📋 Logging', config.logging?.enabled === true],
    ['👋 Welcome', config.welcome?.enabled === true || config.enabled === true],
  ];
  return {
    enabled: features.filter(([, enabled]) => enabled).map(([label]) => label),
    total: features.length,
    // Inactive modules are optional; never penalise them in a health score.
  };
}
