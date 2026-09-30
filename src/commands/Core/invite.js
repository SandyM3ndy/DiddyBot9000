import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
  category: 'Core',
  slashOnly: true,
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get a link to invite Beacon to another server'),

  async execute(interaction) {
    const clientId = interaction.client.user.id;
    const permissions = '8';
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

    const embed = createEmbed({
      title: '🤖 Invite Beacon',
      description: "Want Beacon in another server? Use the button below to invite Beacon.\n\n**Beacon**\n*Your community's all-in-one Discord assistant.*",
      color: 'primary',
      thumbnail: interaction.client.user.displayAvatarURL({ size: 512 }),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Invite Beacon').setURL(inviteUrl).setStyle(ButtonStyle.Link),
    );

    await InteractionHelper.safeReply(interaction, { embeds: [embed], components: [row] });
  },
};
