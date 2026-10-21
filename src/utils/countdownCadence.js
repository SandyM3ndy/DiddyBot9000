// Limits Discord message edits while keeping the final minute responsive.
export function getCountdownEditCadence(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 1000;
    if (seconds > 3600) return 60_000;
    if (seconds > 60) return 10_000;
    return 1000;
}
