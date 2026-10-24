/**
 * Non-destructive reaction role panel autocomplete.
 *
 * A cached channel miss or a failed Discord fetch cannot prove a panel was
 * deleted. Read saved metadata only; editing/removal is an explicit admin act.
 * This also keeps autocomplete inside Discord's short response deadline.
 */
export function buildReactionRolePanelChoices(panels = [], guild = null, filter = '') {
  const needle = String(filter || '').trim().toLowerCase();
  return (Array.isArray(panels) ? panels : [])
    .filter(panel => /^\d{17,20}$/.test(String(panel?.messageId || '')))
    .map(panel => {
      const channel = guild?.channels?.cache?.get(panel.channelId);
      const channelName = channel?.name || 'channel not cached';
      const name = typeof panel.title === 'string' && panel.title.trim()
        ? panel.title.trim() : 'Reaction Role Panel';
      const label = (name + ' · #' + channelName + ' · ' + panel.messageId.slice(-6)).slice(0,100);
      return { name: label, value: panel.messageId };
    })
    .filter(choice => !needle || choice.name.toLowerCase().includes(needle) || choice.value.includes(needle))
    .slice(0,25);
}
