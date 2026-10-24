import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export function getMusicDeferOptions(interaction) {
    // Playback changes are community activity. Only service diagnostics stay private.
    return interaction.commandName === 'music' && interaction.options?.getSubcommand?.(false) === 'status'
        ? { flags: MessageFlags.Ephemeral } : {};
}

export async function deferMusicCommand(interaction) {
    return InteractionHelper.safeDefer(interaction, getMusicDeferOptions(interaction));
}
