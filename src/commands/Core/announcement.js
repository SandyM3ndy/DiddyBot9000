import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const OWNER_ID = '1022691434974957618';

export default {
  data: new SlashCommandBuilder()
    .setName('announcement')
    .setDescription('Post an official bot update to a server\'s configured updates channel')
    .addStringOption(option => option
      .setName('server_id')
      .setDescription('The Discord server ID to announce the update in')
      .setRequired(true))
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

    const serverId = interaction.options.getString('server_id', true).trim();
    const title = interaction.options.getString('title', true).trim();
    const message = interaction.options.getString('message', true).trim();

    if (!/^\d{17,20}$/.test(serverId)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ Invalid Server ID',
          description: 'Please provide a valid Discord server ID.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = interaction.client.guilds.cache.get(serverId);
    if (!guild) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ Server Not Found',
          description: 'DiddyBot9000 is not currently in that server.',
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const config = await (async () => {
      const { getGuildConfig } = await import('../../services/config/guildConfig.js');
      return getGuildConfig(interaction.client, serverId);
    })();

    const channelId = config?.updates?.channelId;
    if (!channelId) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '📢 Updates Channel Not Configured',
          description: `**${guild.name}** has not configured an updates channel in **/configwizard**.\n\nThe announcement was not sent.`,
          color: 'warning',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ Updates Channel Unavailable',
          description: `The configured updates channel for **${guild.name}** could not be found or is not a text channel. Please update it in **/configwizard**.`,
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await channel.send({
        embeds: [createEmbed({
          title: `📢 ${title}`,
          description: message,
          color: 'info',
          footer: 'Official DiddyBot9000 Update',
        })],
      });
    } catch (error) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: '❌ Announcement Failed',
          description: `I could not send the announcement to <#${channel.id}>. Make sure DiddyBot9000 can view the channel and send messages there.`,
          color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
      });
    }

    return InteractionHelper.safeReply(interaction, {
      embeds: [createEmbed({
        title: '✅ Announcement Sent',
        description: `The update was posted in <#${channel.id}> for **${guild.name}**.`,
        color: 'success',
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
