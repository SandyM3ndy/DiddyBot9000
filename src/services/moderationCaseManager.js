import { getFromDb, setInDb } from '../utils/database.js';
import { logEvent } from '../utils/moderation.js';
import { logger } from '../utils/logger.js';

const locks = new Map();
const statuses = new Set(['open', 'reviewing', 'resolved', 'appealed']);

export function normalizeCase(record) {
  const details = record?.review && typeof record.review === 'object' ? record.review : {};
  return {
    ...record,
    review: {
      status: statuses.has(details.status) ? details.status : 'open',
      notes: Array.isArray(details.notes) ? details.notes.slice(-20) : [],
      evidence: Array.isArray(details.evidence) ? details.evidence.slice(-20) : [],
      updatedBy: details.updatedBy || null,
      updatedAt: details.updatedAt || null,
    },
  };
}

export async function getCase(guildId, caseId) {
  const key = 'moderation_case_' + guildId + '_' + caseId;
  const direct = await getFromDb(key, null);
  if (direct) return normalizeCase(direct);
  const all = await getFromDb('moderation_cases_list_' + guildId, []);
  const existing = (Array.isArray(all) ? all : []).find(c => String(c.caseId) === String(caseId));
  return existing ? normalizeCase(existing) : null;
}

export async function updateCaseReview({ client, guild, caseId, editorId, operation, value }) {
  const guildId = guild.id;
  const key = guildId + ':' + caseId;
  const previous = locks.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const record = await getCase(guildId, caseId);
    if (!record) throw new Error('That moderation case was not found.');
    const current = normalizeCase(record);
    const when = new Date().toISOString();
    const text = String(value || '').trim();
    if (operation === 'status') {
      if (!statuses.has(text)) throw new Error('Choose open, reviewing, resolved or appealed.');
      current.review.status = text;
    } else if (operation === 'note') {
      if (!text || text.length > 900) throw new Error('Case notes must contain 1–900 characters.');
      current.review.notes.push({ authorId: editorId, text, when });
      current.review.notes = current.review.notes.slice(-20);
    } else if (operation === 'evidence') {
      let parsed;
      try { parsed = new URL(text); } catch { throw new Error('Evidence must be a valid HTTPS URL.'); }
      if (parsed.protocol !== 'https:' || text.length > 600) {
        throw new Error('Evidence links must use HTTPS and be under 600 characters.');
      }
      current.review.evidence.push({ authorId: editorId, url: text, when });
      current.review.evidence = current.review.evidence.slice(-20);
    } else throw new Error('Unknown case review action.');

    current.review.updatedAt = when;
    current.review.updatedBy = editorId;
    const listKey = 'moderation_cases_list_' + guildId;
    const all = await getFromDb(listKey, []);
    if (!Array.isArray(all) || !all.some(c => String(c.caseId) === String(caseId))) {
      throw new Error('Case history cannot be updated safely; list record missing.');
    }
    // Update the list first because /cases list queries that index.
    await setInDb(listKey, all.map(c => String(c.caseId) === String(caseId) ? current : c));
    await setInDb('moderation_case_' + guildId + '_' + caseId, current);
    void logEvent({
      client, guild, event: {
        action: 'Case Updated', caseId,
        executor: '<@' + editorId + '> (' + editorId + ')',
        target: current.target || 'Unknown', reason: operation + ' updated (details kept in private case history)',
        metadata: { moderatorId: editorId, source: 'Case Manager' },
      },
    }).catch(error => logger.warn('Case audit notification unavailable', { guildId, error: error?.message }));
    return current;
  });
  locks.set(key, task);
  void task.finally(() => { if (locks.get(key) === task) locks.delete(key); }).catch(() => {});
  return task;
}
