import { getFromDb, setInDb } from '../database/wrapper.js';
import { logger } from '../logger.js';

const MAX_INCIDENTS = 60;
const queues = new Map();
const storageKey = guildId => 'guild:' + guildId + ':security:incidents';

export function normalizeIncident(event, now = Date.now()) {
  const severity = ['critical','high','medium','low'].includes(event.severity) ? event.severity : 'medium';
  return {
    id: String(now) + '-' + Math.random().toString(36).slice(2, 7),
    occurredAt: new Date(now).toISOString(),
    action: String(event.action || 'Security detection').slice(0, 100),
    actorId: /^[0-9]{15,22}$/.test(String(event.actorId || '')) ? String(event.actorId) : null,
    severity,
    outcome: ['detected','blocked','kicked','failed','reverted'].includes(event.outcome) ? event.outcome : 'detected',
    detail: String(event.detail || '').replace(/@/g, '@\u200b').slice(0, 300),
    count: Number(event.count || 0),
    threshold: Number(event.threshold || 0),
  };
}

/** Serialize read/modify/write within one process to avoid dropping bursts. */
export function recordSecurityIncident(guildId, event) {
  const previous = queues.get(guildId) || Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const stored = await getFromDb(storageKey(guildId), []);
    const incidents = Array.isArray(stored) ? stored : [];
    const normalized = normalizeIncident(event);
    await setInDb(storageKey(guildId), [normalized, ...incidents].slice(0, MAX_INCIDENTS));
    return normalized;
  });
  queues.set(guildId, job);
  void job.catch(error => logger.warn('Security incident timeline write failed', {
    guildId, error: error?.message,
  })).finally(() => { if (queues.get(guildId) === job) queues.delete(guildId); });
  return job;
}

export async function getSecurityIncidents(guildId, limit = 10) {
  await queues.get(guildId)?.catch(() => {});
  const data = await getFromDb(storageKey(guildId), []);
  return (Array.isArray(data) ? data : []).slice(0, Math.max(1, Math.min(25, Number(limit) || 10)));
}
