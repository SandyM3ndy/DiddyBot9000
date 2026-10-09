const cooldowns = new Map();

export async function enforceAbuseProtection(interaction, command, commandName) {
    const guildId = interaction?.guildId || 'dm';
    const userId = interaction?.user?.id;
    if (!userId) return { allowed: true, remainingMs: 0 };

    const configuredCooldown = Number(command?.cooldown ?? command?.data?.cooldown ?? 0);
    const cooldownMs = Number.isFinite(configuredCooldown) && configuredCooldown > 0
        ? configuredCooldown * (configuredCooldown < 1000 ? 1000 : 1)
        : 0;
    if (cooldownMs === 0) return { allowed: true, remainingMs: 0 };

    const key = `${guildId}:${userId}:${String(commandName || command?.data?.name || 'unknown').toLowerCase()}`;
    const now = Date.now();
    const lastUsed = cooldowns.get(key) || 0;
    const remainingMs = cooldownMs - (now - lastUsed);

    if (remainingMs > 0) return { allowed: false, remainingMs };

    cooldowns.set(key, now);
    if (cooldowns.size > 10000) {
        const cutoff = now - Math.max(cooldownMs, 60_000);
        for (const [entry, timestamp] of cooldowns) {
            if (timestamp < cutoff) cooldowns.delete(entry);
        }
    }
    return { allowed: true, remainingMs: 0 };
}

export function formatCooldownDuration(milliseconds) {
    const seconds = Math.max(1, Math.ceil(Number(milliseconds || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
