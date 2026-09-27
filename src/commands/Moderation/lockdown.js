import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createEmbed, warningEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  activateLockdown,
  isLockdownActive,
  restoreLockdown,
  verifyLockdownConfirmation,
} from '../../services/lockdownService.js';

function ownerOnly(interaction) {
  return Boolean(interaction.guild && interaction.user.id === interaction.guild.ownerId);
}

function confirmationRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:yes`).setLabel('Yes').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${prefix}:no`).setLabel('No').setStyle(ButtonStyle.Secondary),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Emergency-lock the entire server except the server owner.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  category: 'moderation',

  async execute(interaction, config, client) {
    if (!ownerOnly(interaction)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Owner Only', 'Only the server owner can use /lockdown.')],
        ephemeral: true,
      });
    }

    if (isLockdownActive(client, interaction.guild.id)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [warningEmbed('Already Locked Down', 'This server is already in lockdown. Use /unlockdown to restore it.')],
        ephemeral: true,
      });
    }

    await interaction.reply({
      embeds: [warningEmbed('⚠️ ARE YOU SURE YOU WANT TO DO THIS?', 'This will begin an emergency server lockdown. Continue?')],
      components: [confirmationRow('lockdown:stage1')],
      ephemeral: true,
    });

    const stage1 = await interaction.channel?.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('lockdown:stage1:'),
      time: 60000,
    }).catch(() => null);

    if (!stage1 || stage1.customId.endsWith(':no')) {
      if (stage1) await stage1.update({ embeds: [warningEmbed('Lockdown Cancelled', 'No changes were made.')], components: [] }).catch(() => {});
      return;
    }

    await stage1.update({
      embeds: [warningEmbed('⚠️ This may cause damage to the server.', 'The lockdown will modify server permissions and revoke active invites. Are you sure you want to continue?')],
      components: [confirmationRow('lockdown:stage2')],
    });

    const stage2 = await interaction.channel?.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('lockdown:stage2:'),
      time: 60000,
    }).catch(() => null);

    if (!stage2 || stage2.customId.endsWith(':no')) {
      if (stage2) await stage2.update({ embeds: [warningEmbed('Lockdown Cancelled', 'No changes were made.')], components: [] }).catch(() => {});
      return;
    }

    await stage2.update({
      embeds: [
        createEmbed({
          title: '🚨 LAST CHANCE',
          description: 'LOCKDOWN WILL LOCK EVERYTHING DOWN FOR EVERYONE EXCEPT THE SERVER OWNER.\n\nPress **YES** to continue, then enter the required confirmation username.',
          color: 'error',
        }),
      ],
      components: [confirmationRow('lockdown:stage3')],
    });

    const stage3 = await interaction.channel?.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('lockdown:stage3:'),
      time: 60000,
    }).catch(() => null);

    if (!stage3 || stage3.customId.endsWith(':no')) {
      if (stage3) await stage3.update({ embeds: [warningEmbed('Lockdown Cancelled', 'No changes were made.')], components: [] }).catch(() => {});
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('lockdown:confirmation')
      .setTitle('Final Lockdown Confirmation')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confirmation_username')
            .setLabel('Enter the confirmation username')
            .setPlaceholder('Enter the required username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(64),
        ),
      );

    await stage3.showModal(modal);

    const submitted = await stage3.awaitModalSubmit({
      filter: (i) => i.user.id === interaction.user.id && i.customId === 'lockdown:confirmation',
      time: 60000,
    }).catch(() => null);

    if (!submitted) {
      return;
    }

    const confirmation = submitted.fields.getTextInputValue('confirmation_username').trim();

    if (!verifyLockdownConfirmation(confirmation)) {
      await submitted.reply({
        embeds: [warningEmbed('Lockdown Cancelled', 'The confirmation username was incorrect. No changes were made.')],
        ephemeral: true,
      });
      return;
    }

    await submitted.reply({
      embeds: [warningEmbed('🔴 LOCKDOWN', 'Emergency lockdown is being activated now.')],
      ephemeral: true,
    });

    // Send the visible LOCKDOWN alert before permissions are changed.
    await interaction.channel.send({
      embeds: [
        createEmbed({
          title: '🔴 LOCKDOWN',
          description: 'Emergency server lockdown activated by the server owner. Server activity is being restricted.',
          color: 'error',
        }),
      ],
    }).catch((error) => logger.warn(`Could not send lockdown alert in ${interaction.guild.name}: ${error.message}`));

    try {
      const result = await activateLockdown(client, interaction.guild);

      await interaction.editReply({
        embeds: [
          successEmbed(
            '🔒 LOCKDOWN ACTIVE',
            `Server locked down. Channels locked: ${result.channelsLocked}. Roles restricted: ${result.rolesLocked}. Active invites revoked: ${result.invitesRevoked}.`,
          ),
        ],
      });
    } catch (error) {
      logger.error(`Lockdown activation failed in ${interaction.guild.name}:`, error);
      await interaction.editReply({
        embeds: [warningEmbed('Lockdown Failed', 'The lockdown could not be completed. Check the bot permissions and role hierarchy.')],
      }).catch(() => {});
    }
  },
};
