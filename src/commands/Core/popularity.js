import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('popularity')
    .setDescription('View DiddyBot9000 server coverage.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'core',

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Owner Only', 'This command is restricted to SandyMandy.')],
        ephemeral: true,
      });
    }

    const guilds = Array.from(interaction.client.guilds.cache.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    const lines = guilds.map((guild, index) => `${index + 1}. ${guild.name} (${guild.id})`);
    const chunks = [];
    let current = '';

    for (const line of lines) {
      if ((current + line + '\n').length > 3800) {
        chunks.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current) chunks.push(current);

    const first = createEmbed({
      title: '📊 DiddyBot9000 Popularity',
      description: `DiddyBot9000 is currently in **${guilds.length} server(s)**.\n\n${chunks[0] || 'No servers found.'}`,
    });

    await InteractionHelper.safeReply(interaction, { embeds: [first], ephemeral: true });

    for (let i = 1; i < chunks.length; i += 1) {
      await interaction.followUp({
        embeds: [createEmbed({ title: `📊 Servers (${i + 1}/${chunks.length})`, description: chunks[i] })],
        ephemeral: true,
      });
    }
  },
};
