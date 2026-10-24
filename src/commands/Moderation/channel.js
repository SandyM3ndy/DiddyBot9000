import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import lock from './lock.js';
import unlock from './unlock.js';

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Manage who can send messages in the current channel')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(s => s.setName('lock').setDescription('Prevent members from sending messages here'))
    .addSubcommand(s => s.setName('unlock').setDescription('Allow members to send messages here again')),
  category: 'Moderation',
  async execute(interaction, config, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return InteractionHelper.safeReply(interaction, {
        content: 'Manage Channels permission is required.',
        flags: MessageFlags.Ephemeral,
      });
    }
    switch (interaction.options.getSubcommand()) {
      case 'lock': return lock.execute(interaction, config, client || interaction.client);
      case 'unlock': return unlock.execute(interaction, config, client || interaction.client);
      default: return InteractionHelper.safeReply(interaction, {
        content: 'Unknown channel action.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
