import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { isPrimaryBotOwner } from '../../config/bot.js';

// Servers that explicitly opted out of global broadcasts.
const DISABLED_GUILD_IDS = new Set(['1533146166965964943']);

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Bot Owner Only • Announce to eligible Beacon servers')
    .addStringOption(o => o.setName('message').setDescription('Broadcast message').setRequired(true).setMaxLength(1900)),
  category: 'Core',

  async execute(interaction, config, client) {
    if (!isPrimaryBotOwner(interaction.user.id)) {
      return InteractionHelper.safeReply(interaction, {
        content: 'Only the bot owner can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const message = interaction.options.getString('message', true).trim();
    if (!message || message.length > 1900) {
      return InteractionHelper.safeEditReply(interaction, { content: 'Broadcast messages must be between 1 and 1900 characters.' });
    }
    let sent = 0;
    let failed = 0;
    let disabled = 0;
    for (const guild of client.guilds.cache.values()) {
      if (DISABLED_GUILD_IDS.has(guild.id)) { disabled++; continue; }
      try {
        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
        if (!me) { failed++; continue; }
        const channels = guild.channels.cache.filter(channel =>
          [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
          channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
        ).sort((a, b) => a.position - b.position);
        const target = channels.find(channel => /^(general|chat|main|lobby|general-chat|server-chat)$/i.test(channel.name)) ?? channels.first();
        if (!target) { failed++; continue; }
        await target.send({ content: message, allowedMentions: { parse: [] } });
        sent++;
        // Broadcasting should never create a server invite without admin consent.
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        failed++;
        logger.warn('Broadcast delivery failed', { guildId: guild.id, error: error?.message });
      }
    }
    return InteractionHelper.safeEditReply(interaction, {
      content: `📡 **Broadcast complete**\n✅ Sent: **${sent}**\n🚫 Disabled: **${disabled}**\n❌ Failed: **${failed}**`,
    });
  },
};
