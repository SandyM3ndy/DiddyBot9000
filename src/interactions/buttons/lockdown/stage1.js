import { warningEmbed } from '../../../utils/embeds.js';
import { isLockdownActive } from '../../../services/lockdownService.js';

export default {
  name: 'lockdown_stage1',
  async execute(interaction, client, args) {
    const [decision, userId] = args;
    if (!interaction.guild || interaction.user.id !== userId || interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'This lockdown confirmation is not valid for you.', ephemeral: true });
    }

    if (decision === 'no') {
      return interaction.update({ embeds: [warningEmbed('Lockdown Cancelled', 'No changes were made.')], components: [] });
    }

    if (isLockdownActive(client, interaction.guild.id)) {
      return interaction.update({ embeds: [warningEmbed('Already Locked Down', 'This server is already in lockdown.')], components: [] });
    }

    return interaction.update({
      embeds: [warningEmbed('⚠️ This may cause damage to the server.', 'The lockdown will modify server permissions and revoke active invites. Are you sure you want to continue?')],
      components: [{
        type: 1,
        components: [
          { type: 2, custom_id: `lockdown_stage2:yes:${userId}`, label: 'Yes', style: 4 },
          { type: 2, custom_id: `lockdown_stage2:no:${userId}`, label: 'No', style: 2 },
        ],
      }],
    });
  },
};
