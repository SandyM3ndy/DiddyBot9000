import { SlashCommandBuilder } from 'discord.js';
import { warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isLockdownActive } from '../../services/lockdownService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Emergency-lock the entire server except the server owner.')
  category: 'moderation',

  async execute(interaction, config, client) {
    if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Owner Only', 'Only the server owner can use /lockdown.')],
        ephemeral: true,
      });
    }

    if (isLockdownActive(client, interaction.guild.id)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Already Locked Down', 'This server is already in lockdown. Use /unlockdown to restore it.')],
        ephemeral: true,
      });
    }

    return InteractionHelper.safeReply(interaction, {
      embeds: [warningEmbed('⚠️ ARE YOU SURE YOU WANT TO DO THIS?', 'This will begin an emergency server lockdown. Continue?')],
      components: [{
        type: 1,
        components: [
          { type: 2, custom_id: `lockdown_stage1:yes:${interaction.user.id}`, label: 'Yes', style: 4 },
          { type: 2, custom_id: `lockdown_stage1:no:${interaction.user.id}`, label: 'No', style: 2 },
        ],
      }],
      ephemeral: true,
    });
  },
};
