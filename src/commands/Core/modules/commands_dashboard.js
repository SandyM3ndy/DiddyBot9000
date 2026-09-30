import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

export function buildCategoryComponents(guildId, category) {
  const commandOptions = category.commands.filter((command) => !command.protected).slice(0, 25).map((command) => new StringSelectMenuOptionBuilder().setLabel(formatCommandLabel(command).slice(0, 100)).setDescription((category.enabledCommands.includes(command.name) ? '🟢 Enabled — click to disable' : '🔴 Disabled — click to enable').slice(0, 100)).setValue(command.name));
  const rows = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId(DASHBOARD_HOME, guildId)).setLabel('Back').setEmoji('◀️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(customId(DASHBOARD_TOGGLE_CATEGORY, guildId, category.key)).setLabel(category.categoryDisabled ? 'Enable Category' : 'Disable Category').setEmoji(category.categoryDisabled ? '🟢' : '🔴').setStyle(category.categoryDisabled ? ButtonStyle.Success : ButtonStyle.Danger), new ButtonBuilder().setCustomId(customId(DASHBOARD_ENABLE_ALL, guildId, category.key)).setLabel('Enable All').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(customId(DASHBOARD_DISABLE_ALL, guildId, category.key)).setLabel('Disable All').setEmoji('⛔').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(customId(DASHBOARD_RESET_COMMANDS, guildId, category.key)).setLabel('Clear Overrides').setEmoji('🧹').setStyle(ButtonStyle.Secondary))];
  if (commandOptions.length) rows.unshift(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId(DASHBOARD_COMMAND_SELECT, guildId, category.key)).setPlaceholder('Toggle a command or subcommand...').addOptions(commandOptions)));
  return rows;
}

export async function buildDashboardView(client, guildId, guild, view = 'overview', categoryKey = null) {
  const config = await getGuildConfig(client, guildId);
  const snapshot = getCommandAccessSnapshot(client, config);
  if (view === 'category' && categoryKey) {
    const category = snapshot.categories.find((entry) => entry.key === categoryKey);
    if (category) return { embed: buildCategoryEmbed(category, guild), components: buildCategoryComponents(guildId, category), categoryKey };
  }
  return { embed: buildOverviewEmbed(snapshot, guild), components: buildOverviewComponents(guildId, snapshot) };
}

export async function handleDashboardComponent(interaction, client) {
  const [action, guildId, suffix] = interaction.customId.split(':');
  if (guildId !== interaction.guildId) return interaction.reply({ content: 'This dashboard belongs to another server.', ephemeral: true });
  if (action === DASHBOARD_COMMAND_SELECT) {
    const config = await getGuildConfig(client, guildId);
    const snapshot = getCommandAccessSnapshot(client, config);
    const category = snapshot.categories.find((entry) => entry.key === suffix);
    if (category?.enabledCommands.includes(interaction.values[0])) await disableCommand(client, guildId, interaction.values[0]); else await enableCommand(client, guildId, interaction.values[0]);
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix);
    return interaction.update({ embeds: [view.embed], components: view.components });
  }
  await interaction.deferUpdate();
  if (action === DASHBOARD_REFRESH || action === DASHBOARD_HOME) { const view = await buildDashboardView(client, guildId, interaction.guild); return interaction.editReply({ embeds: [view.embed], components: view.components }); }
  if (action === DASHBOARD_CATEGORY_SELECT) { const view = await buildDashboardView(client, guildId, interaction.guild, 'category', interaction.values[0]); return interaction.editReply({ embeds: [view.embed], components: view.components }); }
  if (action === DASHBOARD_TOGGLE_CATEGORY) {
    const config = await getGuildConfig(client, guildId); const snapshot = getCommandAccessSnapshot(client, config); const category = snapshot.categories.find((entry) => entry.key === suffix);
    if (category?.categoryDisabled) await enableCategory(client, guildId, suffix); else await disableCategory(client, guildId, suffix);
  }
  if (action === DASHBOARD_ENABLE_ALL) { await enableCategory(client, guildId, suffix); await resetCategoryCommands(client, guildId, suffix); }
  if (action === DASHBOARD_DISABLE_ALL) await disableCategory(client, guildId, suffix);
  if (action === DASHBOARD_RESET_COMMANDS) { await enableCategory(client, guildId, suffix); await resetCategoryCommands(client, guildId, suffix); }
  const view = await buildDashboardView(client, guildId, interaction.guild, action === DASHBOARD_HOME ? 'overview' : 'category', suffix);
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
