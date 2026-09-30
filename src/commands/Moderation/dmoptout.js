import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DM_OPTOUT_KEY = (userId) => `user:${userId}:dm-optout`;

export default {
  data: new SlashCommandBuilder()
    .setName('dmoptout')
    .setDescription('Block Beacon staff from sending you direct messages.'),
  category: 'moderation',

  async execute(interaction) {
    const key = DM_OPTOUT_KEY(interaction.user.id);
    const current = (await interaction.client.db.get(key, false)) === true;
    const next = !current;

    await interaction.client.db.set(key, next);

    return InteractionHelper.safeReply(interaction, {
      embeds: [
        createEmbed({
          title: next ? '🚫 Beacon Staff DMs Disabled' : '✅ Beacon Staff DMs Enabled',
          description: next
            ? 'You have opted out of Beacon staff DMs. Beacon will no longer allow /dm to contact you.'
            : 'You have opted back in to Beacon staff DMs. Staff can contact you with /dm when appropriate.',
          color: next ? 'warning' : 'success',
          footer: 'Run /dmoptout again at any time to change this setting.',
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
