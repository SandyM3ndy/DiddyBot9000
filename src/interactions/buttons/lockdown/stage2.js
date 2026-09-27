import { warningEmbed } from '../../../utils/embeds.js';

export default {
  name: 'lockdown_stage2',
  async execute(interaction, client, args) {
    const [decision, userId] = args;
    if (!interaction.guild || interaction.user.id !== userId || interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'This lockdown confirmation is not valid for you.', ephemeral: true });
    }

    if (decision === 'no') {
      return interaction.update({ embeds: [warningEmbed('Lockdown Cancelled', 'No changes were made.')], components: [] });
    }

    return interaction.update({
      embeds: [warningEmbed('🚨 LAST CHANCE', 'LOCKDOWN WILL LOCK EVERYTHING DOWN FOR EVERYONE EXCEPT THE SERVER OWNER.\n\nPress **YES** to continue to the final username confirmation.')],
      components: [{
        type: 1,
        components: [
          { type: 2, custom_id: `lockdown_stage3:yes:${userId}`, label: 'YES, CONTINUE', style: 4 },
          { type: 2, custom_id: `lockdown_stage3:no:${userId}`, label: 'NO, CANCEL', style: 2 },
        ],
      }],
    });
  },
};
