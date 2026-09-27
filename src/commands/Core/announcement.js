import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('announcement')
    .setDescription('Broadcast an official DiddyBot9000 update to configured update channels')
    .addStringOption(option => option
      .setName('title')
      .setDescription('Announcement title')
      .setRequired(true)
      .setMaxLength(256))
    .addStringOption(option => option
      .setName('message')
      .setDescription('Announcement message')
      .setRequired(true)
      .setMaxLength(4000)),
  category: 'Owner',

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return InteractionHelper.safeReply(interaction, {
        content: '❌ You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const title = interaction.options.getString('title', true).trim();
    const message = interaction.options.getString('message', true).trim();

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const config = await getGuildConfig(interaction.client, guild.id);
        const channelId = config?.updates?.channelId;

        if (!channelId) {
          skipped++;
          continue;
        }

        const channel = guild.channels.cache.get(channelId)
          ?? await guild.channels.fetch(channelId).catch(() => null);

        if (!channel?.isTextBased()) {
          failed++;
          continue;
        }

        await channel.send({
          embeds: [createEmbed({
            title: `📢 ${title}`,
            description: message,
            color: 'info',
            footer: 'Official DiddyBot9000 Update',
          })],
        });

        sent++;
      } catch (error) {
        failed++;
      }
    }

    return InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: '📢 Update Broadcast Complete',
        description:
          `The update was sent to every server with an updates channel configured.\\n\\n` +
          `✅ **Sent:** ${sent}\\n` +
          `🔕 **Not configured:** ${skipped}\\n` +
          `❌ **Failed:** ${failed}`,
        color: failed > 0 ? 'warning' : 'success',
        footer: 'Only configured update channels receive announcements.',
      })],
    });
  },
};
