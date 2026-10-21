// Pure utilities that keep /help within Discord's embed field length limits.
export function paginateHelpEntries(entries, requestedPage = 1, perPage = 10) {
    const size = Math.max(1, Math.floor(Number(perPage) || 10));
    const totalPages = Math.max(1, Math.ceil(entries.length / size));
    const candidate = Number(requestedPage);
    const page = Math.max(1, Math.min(totalPages, Number.isFinite(candidate) ? Math.trunc(candidate) : 1));
    return { page, totalPages, items: entries.slice((page - 1) * size, page * size) };
}

export function splitHelpEntries(entries, maxLength = 900) {
    const chunks = [];
    let chunk = '';
    const limit = Math.min(1024, Math.max(80, Math.floor(maxLength)));
    for (const raw of entries) {
        const text = String(raw ?? '').slice(0, limit);
        if (chunk && chunk.length + text.length + 1 > limit) {
            chunks.push(chunk);
            chunk = '';
        }
        chunk += (chunk ? '\n' : '') + text;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
}
