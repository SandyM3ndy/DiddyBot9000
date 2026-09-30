import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('popularity')
    .setDescription('View Beacon server coverage.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'core',

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Owner Only', 'This command is restricted to SandyMandy.')],
        ephemeral: true,
      });
    }

    const buildChunks = () => {
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

      return { guilds, chunks };
    };

    const buildEmbed = (guilds, chunk, page, totalPages) =>
      createEmbed({
        title: '📊 Beacon Popularity',
        description:
          `Beacon is currently in **${guilds.length} server(s)**.\n` +
          `**Last updated:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
          (chunk || 'No servers found.'),
        footer: { text: `Page ${page} of ${totalPages} • Auto-updates every 1 minute` },
      });

    const initial = buildChunks();
    const totalPages = initial.chunks.length || 1;
    const messages = [];

    await InteractionHelper.safeReply(interaction, {
      embeds: [buildEmbed(initial.guilds, initial.chunks[0], 1, totalPages)],
      ephemeral: true,
    });

    const firstMessage = await interaction.fetchReply().catch(() => null);
    if (firstMessage) messages.push(firstMessage);

    for (let i = 1; i < initial.chunks.length; i += 1) {
      const message = await interaction.followUp({
        embeds: [buildEmbed(initial.guilds, initial.chunks[i], i + 1, totalPages)],
        ephemeral: true,
      }).catch(() => null);
      if (message) messages.push(message);
    }

    const interval = setInterval(async () => {
      const snapshot = buildChunks();
      const pages = snapshot.chunks.length || 1;

      for (let i = 0; i < messages.length; i += 1) {
        if (!snapshot.chunks[i]) continue;
        await messages[i].edit({
          embeds: [buildEmbed(snapshot.guilds, snapshot.chunks[i], i + 1, pages)],
        }).catch(() => {});
      }
    }, 60_000);

    setTimeout(() => clearInterval(interval), 15 * 60_000);
  }
};
