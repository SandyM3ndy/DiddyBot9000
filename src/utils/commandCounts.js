/**
 * Return the number of commands in the public slash-command registry.
 * Legacy prefix-only handlers are intentionally not counted.
 */
export function getRegisteredCommandCount(client) {
  return new Set(
    [...(client?.commands?.values?.() || [])]
      .filter(command => command?.data?.name && !command.legacyOnly)
      .map(command => command.data.name),
  ).size;
}
