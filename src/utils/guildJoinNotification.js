/**
 * Build a small, accurate guild snapshot for the Beacon owner's private join alert.
 * Cache-derived counts are server-wide only; never label a partial member cache as
 * the number of humans or bots in the guild.
 */
function count(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString('en-AU')
    : 'Unavailable';
}

export function buildGuildJoinFields(guild, owner = null, totalGuilds = null) {
  const ownerId = owner?.id || owner?.user?.id || guild?.ownerId;
  const ownerName = owner?.user?.tag || owner?.user?.username || null;
  const ownerLabel = ownerName
    ? `${ownerName} (` + '`' + `${ownerId}` + '`' + ')'
    : ownerId ? `<@${ownerId}> (` + '`' + `${ownerId}` + '`' + ')' : 'Unavailable';

  const created = Number.isFinite(guild?.createdTimestamp) && guild.createdTimestamp > 0
    ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
    : 'Unavailable';

  return [
    { name: 'Server', value: String(guild?.name || 'Unknown').slice(0, 1024), inline: false },
    { name: 'Server ID', value: '`' + String(guild?.id || 'Unknown') + '`', inline: true },
    { name: 'Server Owner', value: ownerLabel, inline: true },
    { name: 'Members', value: count(guild?.memberCount), inline: true },
    { name: 'Channels', value: count(guild?.channels?.cache?.size), inline: true },
    { name: 'Roles', value: count(guild?.roles?.cache?.size), inline: true },
    { name: 'Server Boosts', value: count(guild?.premiumSubscriptionCount), inline: true },
    { name: 'Server Created', value: created, inline: true },
    { name: 'Beacon Server Count', value: count(totalGuilds), inline: true },
  ];
}
