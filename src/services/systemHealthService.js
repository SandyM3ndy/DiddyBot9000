import { getHeapStatistics } from 'node:v8';
import { logger } from '../utils/logger.js';

const OWNER_ID = '1022691434974957618';
const MONITOR_INTERVAL_MS = 60_000;
const RESTART_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEGRADED_CONSECUTIVE_CHECKS = 3;
const RECOVERY_CONSECUTIVE_CHECKS = 5;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function notifyOwner(client, message) {
  try {
    const owner = await client.users.fetch(OWNER_ID);
    await owner.send(message);
    return true;
  } catch (error) {
    logger.error('Failed to DM bot owner:', error);
    return false;
  }
}

function getMemoryHealth() {
  const memory = process.memoryUsage();
  const heap = getHeapStatistics();
  const heapLimit = heap.heap_size_limit || memory.heapTotal;
  const constrainedMemory = process.constrainedMemory?.() || 0;
  const rssLimit = constrainedMemory > 0 ? constrainedMemory : 1536 * 1024 * 1024;

  const heapRatio = heapLimit > 0 ? memory.heapUsed / heapLimit : 0;
  const rssRatio = rssLimit > 0 ? memory.rss / rssLimit : 0;

  return {
    memory,
    heapLimit,
    constrainedMemory,
    heapRatio,
    rssRatio,
    unhealthy: heapRatio >= 0.85 || rssRatio >= 0.85,
  };
}

export function startSystemHealthMonitor(client) {
  if (client.systemHealthMonitor) {
    return;
  }

  let consecutiveBadChecks = 0;
  let consecutiveHealthyChecks = 0;
  let warned = false;
  let previousRss = process.memoryUsage().rss;

  const check = async () => {
    try {
      const health = getMemoryHealth();
      const dbStatus = client.db?.getStatus?.();
      const databaseDegraded = dbStatus?.isDegraded === true;
      const rssGrowth = health.memory.rss - previousRss;
      previousRss = health.memory.rss;

      const worsening = health.unhealthy || databaseDegraded || (rssGrowth > 50 * 1024 * 1024 && health.rssRatio >= 0.65);

      if (worsening) {
        consecutiveBadChecks++;
        consecutiveHealthyChecks = 0;
      } else {
        consecutiveBadChecks = 0;
        consecutiveHealthyChecks++;
      }

      if (consecutiveBadChecks >= DEGRADED_CONSECUTIVE_CHECKS && !warned) {
        warned = true;

        const reasons = [];
        if (health.heapRatio >= 0.85) {
          reasons.push(`V8 heap is at ${Math.round(health.heapRatio * 100)}%`);
        }
        if (health.rssRatio >= 0.85) {
          reasons.push(`process memory is at ${formatBytes(health.memory.rss)}`);
        }
        if (rssGrowth > 50 * 1024 * 1024) {
          reasons.push(`memory increased by ${formatBytes(rssGrowth)} in the last check`);
        }
        if (databaseDegraded) {
          reasons.push('the database is reporting degraded mode');
        }

        const reasonText = reasons.length ? reasons.join('; ') : 'runtime health has degraded';

        logger.warn('Bot health is degrading', {
          event: 'system.health.degraded',
          reasons,
          rss: health.memory.rss,
          heapUsed: health.memory.heapUsed,
          heapLimit: health.heapLimit,
        });

        await notifyOwner(
          client,
          `⚠️ **Beacon health warning**\\n\\nThe bot is starting to show signs of degraded health.\\n\\n**Reason:** ${reasonText}\\n**RAM:** ${formatBytes(health.memory.rss)}\\n**Uptime:** ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\\n\\nI will only send this warning once unless the bot recovers and becomes unhealthy again.`
        );
      }

      if (!health.unhealthy && !databaseDegraded && consecutiveHealthyChecks >= RECOVERY_CONSECUTIVE_CHECKS) {
        warned = false;
      }
    } catch (error) {
      logger.error('System health monitor check failed:', error);
    }
  };

  client.systemHealthMonitor = setInterval(check, MONITOR_INTERVAL_MS);
  client.systemHealthMonitor.unref?.();
  check();
}

export async function scheduleAutomaticRestart(client) {
  if (client.automaticRestartTimer) {
    return;
  }

  client.automaticRestartTimer = setInterval(async () => {
    if (client.restarting) {
      return;
    }

    client.restarting = true;

    try {
      const port = client.webPort || Number(client.config.api?.port || process.env.PORT || 3000);
      const healthUrl = `http://127.0.0.1:${port}/ready`;

      await notifyOwner(
        client,
        '🔄 **DiddyBot9000 scheduled restart**\\n\\nThe bot has been running for 12 hours and is restarting now to keep memory usage healthy. I will only message again if the restart does not recover successfully.'
      );

      const { spawn } = await import('node:child_process');

      const watchdog = spawn(
        process.execPath,
        ['scripts/restartWatchdog.js'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DIDDY_RESTART_HEALTH_URL: healthUrl,
            DIDDY_RESTART_OWNER_ID: OWNER_ID,
          },
          detached: true,
          stdio: 'ignore',
        }
      );

      watchdog.unref();

      logger.warn('Starting scheduled 12-hour restart', {
        event: 'system.restart.scheduled',
        healthUrl,
      });

      await client.shutdown('SCHEDULED_RESTART', 1);
    } catch (error) {
      client.restarting = false;
      logger.error('Scheduled restart failed before shutdown:', error);
      await notifyOwner(
        client,
        `🚨 **DiddyBot9000 restart failed**\\n\\nThe scheduled 12-hour restart could not be started cleanly.\\n\\n**Error:** ${error.message}`
      );
    }
  }, RESTART_INTERVAL_MS);

  client.automaticRestartTimer.unref?.();
}
