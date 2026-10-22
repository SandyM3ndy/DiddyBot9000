// Parse user IDs without silently ignoring invalid tokens or truncating.
export function parseMassActionTargets(raw, maximum = 20) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError('Invalid maximum target count.');
  const tokens = String(raw || '').trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error('Provide at least one Discord user ID or mention.');
  const ids = [];
  const seen = new Set();
  for (const token of tokens) {
    const match = token.match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
    if (!match) throw new Error('All targets must be Discord user IDs or mentions (17–20 digits).');
    const id = match[1] || match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length > maximum) throw new Error(`You can select at most ${maximum} unique users per operation.`);
  }
  return ids;
}
