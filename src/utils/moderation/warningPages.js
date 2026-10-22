export function pageWarnings(warnings, requestedPage = 1, perPage = 8) {
  const records = Array.isArray(warnings) ? warnings : [];
  const size = Math.max(1, Math.min(20, Math.trunc(Number(perPage) || 8)));
  const totalPages = Math.max(1, Math.ceil(records.length / size));
  const requested = Number(requestedPage);
  const page = Math.max(1, Math.min(totalPages, Number.isFinite(requested) ? Math.trunc(requested) : 1));
  const offset = (page - 1) * size;
  return { page, totalPages, count: records.length,
    items: records.slice(offset, offset + size).map((warning, i) => ({ number: offset + i + 1, warning })) };
}
