export function countActiveWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings.filter(w => w && w.status !== 'deleted').length
    : 0;
}
