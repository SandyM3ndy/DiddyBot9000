import { InteractionHelper } from '../../utils/interactionHelper.js';

// Music controls and service health are safe to share with the voice channel.
// This summary includes only connectivity and queue totals, not credentials.
export function getMusicDeferOptions(_interaction) {
  return {};
}

export async function deferMusicCommand(interaction) {
  return InteractionHelper.safeDefer(interaction, getMusicDeferOptions(interaction));
}
