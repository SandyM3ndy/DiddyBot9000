import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Inspect a user, view their roles, and see their avatar')
    .addUserOption(o => o.setName('target').setDescription('User to inspect (defaults to you)'))
    .addBooleanOption(o => o.setName('avatar').setDescription('Show the full-size avatar in the info card'))
    .setDMPermission(false),
  category: 'Utility',

  async execute(interaction) {
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    try {
      const user = interaction.options.getUser('target') || interaction.user;
      const showAvatar = interaction.options.getBoolean?.('avatar') ?? true;
      const member = interaction.guild?.members?.cache?.get(user.id) ||
        await interaction.guild?.members?.fetch?.(user.id).catch(() => null);
      const avatar = member?.displayAvatarURL?.({ size: 2048 }) || user.displayAvatarURL({ size: 2048 });
      const created = Math.floor(user.createdAt.getTime() / 1000);
      const joined = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;
      const roles = member?.roles?.cache?.filter(role => role.id !== interaction.guildId);
      const roleNames = roles?.map(role => role.name).slice(0, 8).join(', ') || 'None';
      const embed = createEmbed({
        title: `👤 ${user.username}`,
        description: `[View or download full-size avatar](${avatar})`,
        color: 'info',
      })
        .setThumbnail(avatar)
        .addFields(
          { name: 'User ID', value: user.id, inline: true },
          { name: 'Bot account', value: user.bot ? 'Yes' : 'No', inline: true },
          { name: 'Account created', value: `<t:${created}:R>`, inline: true },
          { name: 'Joined server', value: joined ? `<t:${joined}:R>` : 'Not in server', inline: true },
          { name: 'Highest role', value: member?.roles?.highest?.name || 'None', inline: true },
          { name: 'Roles', value: roleNames.slice(0, 1000), inline: false },
        );
      if (showAvatar) embed.setImage(avatar);
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.warn('User info failed', { guildId: interaction.guildId, error: error?.message });
      await InteractionHelper.safeEditReply(interaction, { content: 'Could not load that profile. Please try again.' });
    }
  },
};
