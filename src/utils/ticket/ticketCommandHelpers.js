export function normalizeTicketChannelName(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
}

export function protectedTicketParticipant(targetId, { creatorId, ownerId, botId } = {}) {
  const target = String(targetId || '');
  return Boolean(target && [creatorId, ownerId, botId].some(id => id && String(id) === target));
}
