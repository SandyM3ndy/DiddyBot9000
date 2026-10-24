import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { openReactionRoleDashboard } from '../../../commands/Reaction_roles/reactroles.js';

export default {
  name: 'rr_dashboard_select',
  async execute(interaction) {
    if (!interaction.inGuild?.() || !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: 'Manage Server permission is required to manage reaction-role panels.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const chosen = interaction.values?.[0];
    return openReactionRoleDashboard(interaction, chosen);
  },
};
