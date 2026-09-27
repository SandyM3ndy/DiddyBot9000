import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { warningEmbed } from '../../../utils/embeds.js';

export default {
  name: 'lockdown_stage3',
  async execute(interaction, client, args) {
    const [decision, userId] = args;
    if (!interaction.guild || interaction.user.id !== userId || interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'This lockdown confirmation is not valid for you.', ephemeral: true });
    }

    if (decision === 'no') {
      return interaction.update({ embeds: [warningEmbed('Lockdown Cancelled', 'No changes were made.')], components: [] });
    }

    const modal = new ModalBuilder()
      .setCustomId(`lockdown_confirmation:${userId}`)
      .setTitle('Final Lockdown Confirmation')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confirmation_username')
            .setLabel('Enter the confirmation username')
            .setPlaceholder('sandymandy123')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64),
        ),
      );

    return interaction.showModal(modal);
  },
};
