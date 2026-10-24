/**
 * Lightweight per-guild spam window. Entries for inactive users are periodically
 * removed so the tracker cannot grow forever in a long-running bot.
 */
export function createSpamTracker({ windowMs = 10_000, sweepIntervalMs = 60_000 } = {}) {
  const buckets = new Map();
  let nextSweepAt = 0;

  function inspect({ guildId, userId, content = '', mentionCount = 0, now = Date.now() }) {
    if (now >= nextSweepAt) {
      for (const [key, entries] of buckets) {
        if (!entries.length || entries[entries.length - 1].at < now - windowMs) {
          buckets.delete(key);
        }
      }
      nextSweepAt = now + sweepIntervalMs;
    }

    const key = `${guildId}:${userId}`;
    const normalizedContent = String(content).trim().toLowerCase();
    const oldEntries = buckets.get(key) || [];
    const recent = [
      ...oldEntries.filter(entry => now - entry.at <= windowMs),
      { at: now, content: normalizedContent },
    ].slice(-10);
    buckets.set(key, recent);

    const fastCount = recent.filter(entry => now - entry.at <= 8_000).length;
    const duplicateCount = normalizedContent
      ? recent.filter(entry => entry.content === normalizedContent).length
      : 0;

    if (fastCount >= 6) return 'Spam — too many messages in a short period.';
    if (duplicateCount >= 3) return 'Spam — repeated messages.';
    if (mentionCount >= 6) return 'Spam — excessive mentions.';
    return null;
  }

  return { inspect, get trackedUsers() { return buckets.size; } };
}
