import {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { BEACON_TEAM_NAME } from '../../config/bot.js';

// Do not request Administrator for ordinary installations. This default
// provides the permissions needed for ticket, moderation and role modules;
// each guild owner can review/remove permissions in Discord before inviting.
export const BEACON_INSTALL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
].reduce((mask, permission) => mask | permission, 0n);

export function getBeaconInviteUrl(clientId) {
  if (!/^\d{17,20}$/.test(String(clientId))) {
    throw new Error('A valid Discord application ID is required for the invite.');
  }
  const params = new URLSearchParams({
    client_id: String(clientId),
    permissions: BEACON_INSTALL_PERMISSIONS.toString(),
    scope: 'bot applications.commands',
  });
  return 'https://discord.com/oauth2/authorize?' + params.toString();
}

export default {
  category: 'Core',
  slashOnly: true,
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get a secure link to add Beacon to another Discord server'),

  async execute(interaction) {
    const inviteUrl = getBeaconInviteUrl(interaction.client.user.id);
    const embed = createEmbed({
      title: '🚀 Bring Beacon to Your Community',
      description: [
        '**Your community\'s all-in-one Discord assistant.**',
        'Manage moderation, tickets, security, welcome messages and reaction roles',
        'from **/dashboard**, your main Control Center.',
        '',
        'Bring members together with optional quests and global server rankings.',
        '',
        '🔒 **Transparent installation:** Beacon does not request Administrator permission.',
        'Discord will show the specific permissions requested before you approve.',
        'You can adjust Beacon’s permissions in your server later.',
        '',
        '💜 Thanks for considering Beacon for your community. — ' + BEACON_TEAM_NAME,
      ].join('\n'),
      color: 'primary',
      thumbnail: interaction.client.user.displayAvatarURL({ size: 512 }),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Invite Beacon').setEmoji('🚀')
        .setURL(inviteUrl).setStyle(ButtonStyle.Link),
    );
    await InteractionHelper.safeReply(interaction, { embeds: [embed], components: [row] });
  },
};
