import {
  ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, getAllReactionRoleMessages, hasDangerousPermissions } from '../../services/reactionRoleService.js';
import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';

export const REACTION_ROLE_SETUP_BUTTON = 'rr_dashboard_create';
export const REACTION_ROLE_SETUP_MODAL = 'rr_dashboard_setup';
export const REACTION_ROLE_PANEL_PICKER = 'rr_dashboard_select';

export function buildReactionRoleSetupModal() {
  const modal = new ModalBuilder()
    .setCustomId(REACTION_ROLE_SETUP_MODAL)
    .setTitle('Beacon • Create Reaction Roles');

  modal.addLabelComponents(
    new LabelBuilder().setLabel('Panel title')
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId('rr_setup_title').setStyle(TextInputStyle.Short)
        .setPlaceholder('Choose your roles').setRequired(true).setMaxLength(100)),
    new LabelBuilder().setLabel('Panel description')
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId('rr_setup_description').setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Select the roles you would like to receive')
        .setRequired(true).setMaxLength(1000)),
    new LabelBuilder().setLabel('Channel to post the panel')
      .setChannelSelectMenuComponent(new ChannelSelectMenuBuilder()
        .setCustomId('rr_setup_channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1).setMaxValues(1).setRequired(true)),
    new LabelBuilder().setLabel('Self-assignable roles (1–5)')
      .setRoleSelectMenuComponent(new RoleSelectMenuBuilder()
        .setCustomId('rr_setup_roles')
        .setMinValues(1).setMaxValues(5).setRequired(true)),
  );
  return modal;
}

export function buildReactionRoleLanding(panels = [], guild) {
  const length = panels.length;
  const description = length
    ? '**' + length + ' existing panel(s)**\nSelect a panel below to manage its roles, edit its text or repair its message.'
    : '**Welcome to Reaction Roles.**\nNo panels exist yet. Click **Create Panel** to choose a channel, title and self-assignable roles—all from the dashboard.';
  const embed = new EmbedBuilder().setTitle('🎭 Beacon • Reaction Roles')
    .setDescription(description)
    .setColor(getColor('primary'))
    .addFields(
      { name: '🔐 Safe by design', value: 'Beacon only offers roles below its own role, and rejects administrator or privileged roles.', inline: false },
      { name: '🧭 Getting started', value: length
        ? 'Choose a panel to configure, or create another one (maximum 5 per server).'
        : 'Select **Create Panel**. Your role selector will be posted once setup succeeds.', inline: false },
    );
  const components = [];
  if (length) {
    const choices = panels.slice(0, 5).map((p, index) => ({
      label: 'Panel ' + (index + 1) + (guild?.channels?.cache?.get(p.channelId)?.name
        ? ' • #' + guild.channels.cache.get(p.channelId).name.slice(0, 60) : ''),
      value: p.messageId,
      description: String((p.roles || []).length) + ' roles • Manage settings',
      emoji: '🎭',
    }));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(REACTION_ROLE_PANEL_PICKER)
        .setPlaceholder('🎭 Select a reaction role panel...').setMinValues(1).setMaxValues(1)
        .addOptions(choices),
    ));
  }
  if (length < 5) {
    const { ButtonBuilder, ButtonStyle } = { ButtonBuilder: null, ButtonStyle: null };
    // Imported below to keep this renderer usable in command and component contexts.
  }
  return { embeds: [embed], components };
}

export async function handleReactionRoleCreateButton(interaction) {
  if (!interaction.inGuild?.() || !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    return InteractionHelper.safeReply(interaction, {
      content: 'Manage Server permission is required to create reaction role panels.',
      flags: MessageFlags.Ephemeral,
    });
  }
  return InteractionHelper.safeShowModal(interaction, buildReactionRoleSetupModal());
}

export async function createReactionRolePanelFromModal(interaction, client) {
  if (!interaction.inGuild?.() || !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    return InteractionHelper.safeReply(interaction, {
      content: 'Manage Server permission is required to create reaction role panels.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
  const fail = (message) => InteractionHelper.safeEditReply(interaction, {
    content: '⚠️ ' + message,
    allowedMentions: { parse: [] },
  });
  try {
    const guild = interaction.guild;
    const member = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return fail('Beacon needs **Manage Roles** permission to configure reaction roles.');
    }
    const title = interaction.fields.getTextInputValue('rr_setup_title')?.trim();
    const description = interaction.fields.getTextInputValue('rr_setup_description')?.trim();
    const channelId = interaction.fields.getField('rr_setup_channel')?.values?.[0];
    const ids = [...new Set(interaction.fields.getField('rr_setup_roles')?.values || [])];
    if (!title || !description || !channelId || ids.length < 1 || ids.length > 5) {
      return fail('Choose a title, description, posting channel and 1–5 roles.');
    }
    const channel = guild.channels.cache.get(channelId)
      || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return fail('Choose a valid text or announcement channel.');
    }
    const botChannelPermissions = channel.permissionsFor(member);
    if (!botChannelPermissions?.has(PermissionFlagsBits.ViewChannel) ||
        !botChannelPermissions.has(PermissionFlagsBits.SendMessages) ||
        !botChannelPermissions.has(PermissionFlagsBits.EmbedLinks)) {
      return fail('Beacon needs View Channel, Send Messages and Embed Links in ' + channel.toString() + '.');
    }
    const roles = [];
    for (const id of ids) {
      const role = guild.roles.cache.get(id) || await guild.roles.fetch(id).catch(() => null);
      if (!role || role.id === guild.id || role.managed ||
          role.position >= member.roles.highest.position || hasDangerousPermissions(role)) {
        return fail('A selected role cannot be assigned safely. Choose roles below Beacon in the role list, with no privileged permissions.');
      }
      roles.push(role);
    }
    const existingPanels = await getAllReactionRoleMessages(client, guild.id);
    if (existingPanels.length >= 5) return fail('This server already has five reaction-role panels. Remove one before creating another.');

    const panelEmbed = new EmbedBuilder().setTitle(title).setDescription(description)
      .setColor(getColor('info'))
      .addFields({ name: '🎭 Available Roles', value: roles.map(r => r.toString()).join('\n') })
      .setFooter({ text: 'Beacon • Select to add or remove roles' });

    const select = new StringSelectMenuBuilder().setCustomId('reaction_roles')
      .setPlaceholder('🎭 Select your roles').setMinValues(0).setMaxValues(roles.length)
      .addOptions(roles.map(role => ({
        label: role.name.slice(0, 100),
        value: role.id,
        description: 'Toggle the ' + role.name.slice(0, 72) + ' role',
      })));

    const message = await channel.send({
      embeds: [panelEmbed], components: [new ActionRowBuilder().addComponents(select)],
      allowedMentions: { parse: [] },
    });
    try {
      await createReactionRoleMessage(client, guild.id, channel.id, message.id, roles.map(r => r.id));
    } catch (error) {
      await message.delete().catch(() => {});
      throw error;
    }
    return InteractionHelper.safeEditReply(interaction, {
      content: '✅ **Reaction-role panel created!**\nPosted in ' + channel.toString() +
        ' with ' + roles.length + ' self-assignable role(s).\n' + message.url +
        '\n\nOpen **/dashboard → Reaction Roles** to manage this panel.',
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger.error('Reaction-role dashboard setup failed', {
      guildId: interaction.guildId, userId: interaction.user.id, error: error?.message,
    });
    return fail(error?.userMessage || 'Could not create this reaction-role panel. No working configuration was saved. Please try again.');
  }
}
