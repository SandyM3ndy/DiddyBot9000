import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import {
  getCommandAccessSnapshot,
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resetCategoryCommands,
} from '../../../services/commandAccessService.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';

export const DASHBOARD_CATEGORY_SELECT = 'cmdaccess_category';
export const DASHBOARD_COMMAND_SELECT = 'cmdaccess_command';
export const DASHBOARD_TOGGLE_CATEGORY = 'cmdaccess_toggle_category';
export const DASHBOARD_ENABLE_ALL = 'cmdaccess_enable_all';
export const DASHBOARD_DISABLE_ALL = 'cmdaccess_disable_all';
export const DASHBOARD_RESET_COMMANDS = 'cmdaccess_reset_commands';
export const DASHBOARD_REFRESH = 'cmdaccess_refresh';
export const DASHBOARD_HOME = 'cmdaccess_home';
export const DASHBOARD_PAGE = 'cmdaccess_page';
export const COMMANDS_PER_PAGE = 20;

const STATUS = { enabled: '🟢', partial: '🟡', disabled: '🔴' };

function customId(action, guildId, suffix = '') {
  return suffix ? `${action}:${guildId}:${suffix}` : `${action}:${guildId}`;
}

function getCategoryStatus(category) {
  if (category.categoryDisabled) return STATUS.disabled;
  if (category.disabledCount === 0) return STATUS.enabled;
  return STATUS.partial;
}

function formatCommandLabel(command) {
  return command.isSubcommand ? command.name.replace(' ', ' · ') : command.name;
}

function chunkLines(lines, maxLength = 1000) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    if (current.length && length + line.length + 1 > maxLength) {
      chunks.push(current.join('\n'));
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks.length ? chunks : ['*None*'];
}

function buildOverviewEmbed(snapshot, guild) {
  const fullyEnabled = snapshot.categories.filter((c) => !c.categoryDisabled && c.disabledCount === 0).length;
  const partial = snapshot.categories.filter((c) => !c.categoryDisabled && c.disabledCount > 0).length;
  const disabled = snapshot.categories.filter((c) => c.categoryDisabled).length;
  const categoryLines = snapshot.categories.map((category) => {
    const icon = getCategoryStatus(category);
    const subcommandNote = category.commands.some((c) => c.isSubcommand) ? ' · incl. subcommands' : '';
    return `${icon} ${category.icon} **${category.displayName}** — ${category.enabledCount}/${category.totalCount}${subcommandNote}`;
  });
  const fields = [
    { name: '📊 Summary', value: [`**${snapshot.enabledTotal}/${snapshot.totalCommands}** entries enabled`, `${STATUS.enabled} ${fullyEnabled} fully on · ${STATUS.partial} partial · ${STATUS.disabled} off`].join('\n'), inline: false },
    { name: '🔑 Legend', value: `${STATUS.enabled} All enabled · ${STATUS.partial} Some disabled · ${STATUS.disabled} Category off`, inline: false },
  ];
  chunkLines(categoryLines).forEach((chunk, index) => fields.push({ name: index === 0 ? '📁 Categories' : '📁 Categories (cont.)', value: chunk, inline: false }));
  fields.push({ name: 'How to Use', value: ['• Select a category below to manage commands and subcommands', '• Select a command to toggle it', '• Use the buttons to enable/disable or clear overrides'].join('\n') });
  return createEmbed({
    title: '⚙️ Command Access',
    description: `Manage slash and prefix commands for **${guild.name}**. Subcommands are listed separately.`,
    color: 'info',
    fields,
    footer: '🔒 Protected entries cannot be disabled',
  });
}

export function buildCategoryEmbed(category, guild) {
  const statusIcon = getCategoryStatus(category);
  const statusText = category.categoryDisabled ? 'Category disabled' : category.disabledCount === 0 ? 'All entries enabled' : `${category.disabledCount} of ${category.totalCount} disabled`;
  const commandLines = category.commands.map((command) => `${category.enabledCommands.includes(command.name) ? STATUS.enabled : STATUS.disabled} ${formatCommandLabel(command)}${command.protected ? ' 🔒' : ''}`);
  const fields = [{ name: `${statusIcon} Status`, value: statusText, inline: true }, { name: '📈 Count', value: `${category.enabledCount}/${category.totalCount} enabled`, inline: true }];
  chunkLines(commandLines).forEach((chunk, index) => fields.push({ name: index === 0 ? '📋 Commands & Subcommands' : '📋 (cont.)', value: chunk, inline: false }));
  return createEmbed({ title: `${category.icon} ${category.displayName}`, description: `Command access for **${guild.name}**.`, color: category.categoryDisabled ? 'error' : category.disabledCount > 0 ? 'warning' : 'success', fields, footer: '🔒 Protected entries cannot be disabled' });
}

export function buildOverviewComponents(guildId, snapshot) {
  const categoryOptions = snapshot.categories.slice(0, 25).map((category) => new StringSelectMenuOptionBuilder().setLabel(category.displayName.slice(0, 100)).setDescription(`${getCategoryStatus(category)} ${category.enabledCount}/${category.totalCount} enabled`.slice(0, 100)).setValue(category.key).setEmoji(category.icon));
  return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(DASHBOARD_CATEGORY_SELECT, guildId)).setPlaceholder('📁 Select a category...').addOptions(categoryOptions)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId(DASHBOARD_REFRESH, guildId)).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary))];
}

export function getCommandCategoryPage(category, page = 0) {
  const available = (category.commands || []).filter(command => !command.protected);
  const totalPages = Math.max(1, Math.ceil(available.length / COMMANDS_PER_PAGE));
  const currentPage = Math.max(0, Math.min(Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 0, totalPages - 1));
  return { available, totalPages, currentPage,
    items: available.slice(currentPage * COMMANDS_PER_PAGE, (currentPage + 1) * COMMANDS_PER_PAGE) };
}

export function buildCategoryComponents(guildId, category, page = 0) {
  const { items, currentPage, totalPages } = getCommandCategoryPage(category, page);
  const commands = items.map(command => new StringSelectMenuOptionBuilder()
    .setLabel(formatCommandLabel(command).slice(0, 100))
    .setDescription((category.enabledCommands.includes(command.name)
      ? '🟢 Enabled — select to disable' : '🔴 Disabled — select to enable').slice(0,100))
    .setValue(command.name));
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId(DASHBOARD_HOME, guildId)).setLabel('Overview').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customId(DASHBOARD_TOGGLE_CATEGORY, guildId, category.key)).setLabel(category.categoryDisabled ? 'Enable Category' : 'Disable Category')
      .setEmoji(category.categoryDisabled ? '🟢' : '🔴').setStyle(category.categoryDisabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(customId(DASHBOARD_ENABLE_ALL, guildId, category.key)).setLabel('Enable All').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(customId(DASHBOARD_DISABLE_ALL, guildId, category.key)).setLabel('Disable All').setEmoji('⛔').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(customId(DASHBOARD_RESET_COMMANDS, guildId, category.key)).setLabel('Clear Overrides').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
  )];
  if (commands.length) rows.unshift(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId(DASHBOARD_COMMAND_SELECT, guildId, category.key + ':' + currentPage))
      .setPlaceholder('Toggle a command • Page ' + (currentPage + 1) + '/' + totalPages)
      .addOptions(commands),
  ));
  if (totalPages > 1) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId(DASHBOARD_PAGE, guildId, category.key + ':' + (currentPage - 1)))
      .setLabel('Previous').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
    new ButtonBuilder().setCustomId(customId(DASHBOARD_PAGE, guildId, category.key + ':' + (currentPage + 1)))
      .setLabel('Next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1),
  ));
  return rows;
}

export async function buildDashboardView(client, guildId, guild, view = 'overview', categoryKey = null, page = 0) {
  const config = await getGuildConfig(client, guildId);
  const snapshot = getCommandAccessSnapshot(client, config);
  if (view === 'category' && categoryKey) {
    const category = snapshot.categories.find((entry) => entry.key === categoryKey);
    if (category) return { embed: buildCategoryEmbed(category, guild), components: buildCategoryComponents(guildId, category, page), categoryKey };
  }
  return { embed: buildOverviewEmbed(snapshot, guild), components: buildOverviewComponents(guildId, snapshot) };
}

export async function handleDashboardComponent(interaction, client) {
  const [action, guildId, suffix, pagePart] = interaction.customId.split(':');
  if (guildId !== interaction.guildId) return interaction.reply({
    content: 'This dashboard belongs to another server.', flags: MessageFlags.Ephemeral,
  });
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Manage Server permission is required to change command access.', flags: MessageFlags.Ephemeral });
  }
  // Immediately acknowledge the component, even when a database write is slow.
  await interaction.deferUpdate();
  const page = Math.max(0, Number(pagePart) || 0);
  if (action === DASHBOARD_COMMAND_SELECT) {
    const config = await getGuildConfig(client, guildId);
    const snapshot = getCommandAccessSnapshot(client, config);
    const category = snapshot.categories.find(entry => entry.key === suffix);
    const chosen = interaction.values?.[0];
    const entry = category?.commands.find(command => command.name === chosen);
    if (!entry || entry.protected) {
      return interaction.followUp({ content: 'This command cannot be changed in this category.', flags: MessageFlags.Ephemeral });
    }
    if (category.enabledCommands.includes(chosen)) await disableCommand(client, guildId, chosen);
    else await enableCommand(client, guildId, chosen);
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix, page);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }
  if ([DASHBOARD_REFRESH, DASHBOARD_HOME].includes(action)) {
    const view = await buildDashboardView(client, guildId, interaction.guild);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }
  if (action === DASHBOARD_CATEGORY_SELECT) {
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', interaction.values[0], 0);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }
  if (action === DASHBOARD_PAGE) {
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix, page);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }
  if (action === DASHBOARD_TOGGLE_CATEGORY) {
    const config = await getGuildConfig(client, guildId);
    const snapshot = getCommandAccessSnapshot(client, config);
    const category = snapshot.categories.find(entry => entry.key === suffix);
    if (!category) return interaction.followUp({ content: 'Category not found.', flags: MessageFlags.Ephemeral });
    if (category.categoryDisabled) await enableCategory(client, guildId, suffix);
    else await disableCategory(client, guildId, suffix);
  } else if (action === DASHBOARD_ENABLE_ALL) {
    await enableCategory(client, guildId, suffix);
    await resetCategoryCommands(client, guildId, suffix);
  } else if (action === DASHBOARD_DISABLE_ALL) {
    await disableCategory(client, guildId, suffix);
  } else if (action === DASHBOARD_RESET_COMMANDS) {
    await enableCategory(client, guildId, suffix);
    await resetCategoryCommands(client, guildId, suffix);
  }
  const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix, 0);
  return interaction.editReply({ embeds: [view.embed], components: view.components });
}

export function isCommandAccessCustomId(customIdValue) { return customIdValue.startsWith('cmdaccess_'); }
export function createDashboardCollectorFilter(userId, guildId) { return (componentInteraction) => componentInteraction.user.id === userId && componentInteraction.customId.includes(`:${guildId}`); }

export default {
  async execute(interaction, config, client) {
    const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
    await interaction.editReply({ embeds: [view.embed], components: view.components });
  },
};
