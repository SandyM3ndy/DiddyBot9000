import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { createSelectMenu } from '../../utils/components.js';
import { formatCategoryName, getCategoryIcon } from '../../config/commands/commandCategories.js';

const SUPPORT_URL = 'https://discord.gg/76N2EM6v6k';

export function getHelpOverview(client) {
  const commands = [...(client?.commands?.values() || [])].filter(command => command?.data?.name && !command.legacyOnly);
  const categories = new Map();
  for (const command of commands) {
    if (command.data.name === 'help') continue;
    const key = command.category || 'Core';
    categories.set(key, (categories.get(key) || 0) + 1);
  }
  return { commands: commands.length, categories };
}

export async function createInitialHelpMenu(client) {
  const { commands, categories } = getHelpOverview(client);
  const options = [
    { label: 'All Commands', description: 'Explore everything Beacon can do', value: 'help-all-commands', emoji: '📚' },
    ...[...categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => ({
      label: formatCategoryName(category).slice(0, 100),
      description: String(count) + ' commands • ' + (category === 'BotOwner' ? 'Beacon developer only' : 'Browse tools and features'),
      value: category,
      emoji: getCategoryIcon(category),
    })),
  ].slice(0, 25);

  const embed = createEmbed({
    title: '✦ Beacon | Command Center',
    description: [
      '**Level up your Discord community.**',
      'Global server rankings, rotating quests, moderation, tickets and security — all in Beacon.', 
      '',
      'Choose a category below to browse commands and their access requirements.',
    ].join('\n'),
    color: 'primary',
    thumbnail: client?.user?.displayAvatarURL?.({ size: 256 }) || null,
    fields: [
      { name: '📚 Commands', value: String(commands), inline: true },
      { name: '🗂️ Categories', value: String(categories.size), inline: true },
      { name: '🛡️ Security', value: 'Moderation & Anti-Nuke', inline: true },
      { name: '🚀 Get started', value: '**/progression overview** — Explore quests, rankings and server XP\n**/dashboard** — Configure your community\n**/diagnose** — Check setup and permissions', inline: false },
      { name: '🎯 Community Progression', value: '**/progression quests** — Daily challenges\n**/progression weekly** — Weekly goals\n**/progression leaderboard** — Global server rankings', inline: false },
      { name: '🧰 Administration', value: '**/roleaudit** — Review powerful server roles\n**/ticketstats** — Track your support workload', inline: false },
      { name: '👑 Developer tools', value: 'The **Bot Owner** category contains commands reserved for Beacon’s creator. Server owners and moderators can manage their own communities normally.', inline: false },
    ],
    footer: 'Beacon • Explore the categories below',
  });
  const supportButton = new ButtonBuilder()
    .setLabel('Official Support Server')
    .setEmoji('💬')
    .setURL(SUPPORT_URL)
    .setStyle(ButtonStyle.Link);
  const components = [new ActionRowBuilder().addComponents(supportButton)];
  if (options.length) {
    components.push(createSelectMenu('help-category-select', '📚 Select a command category...', options));
  }
  return { embeds: [embed], components };
}

export function searchBeaconCommands(client, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];
  return [...(client?.commands?.values() || [])]
    .filter(command => command?.data?.name && !command.legacyOnly)
    .map(command => ({
      name: command.data.name,
      category: formatCategoryName(command.category || 'Core'),
      description: command.data.description || 'No description provided',
    }))
    .filter(command => [command.name, command.category, command.description].some(s => s.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default {
  slashOnly: true,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Open the Beacon command center and feature categories')
    .addStringOption(o => o.setName('search').setDescription('Find commands by name or purpose').setMaxLength(70))
    .addBooleanOption(o => o.setName('private').setDescription('Show command help only to you (default: public)')),

  category: 'Core',
  async execute(interaction, config, client) {
    const privateView = interaction.options?.getBoolean?.('private') === true;
    if (!(await InteractionHelper.safeDefer(interaction, privateView ? { flags: MessageFlags.Ephemeral } : {}))) return;
    try {
      const query = interaction.options?.getString?.('search')?.trim();
      if (query) {
        const matched = searchBeaconCommands(client || interaction.client, query);
        const items = matched.slice(0, 15);
        const embed = createEmbed({
          title: '🔎 Beacon • Command Search',
          description: matched.length
            ? '**' + matched.length + ' match(es)** for "' + query + '"\n' +
              (matched.length > items.length ? 'Showing the first 15. Try a more specific search.' : 'Select a command from the list below.')
            : 'No command matched "' + query + '". Try a category such as tickets, music or moderation.',
          color: 'primary',
          fields: items.map(x => ({
            name: '/' + x.name + ' • ' + x.category,
            value: x.description,
            inline: false,
          })),
          footer: 'Beacon • Command Center • Search all public commands',
        });
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [] });
      }
      await InteractionHelper.safeEditReply(interaction, await createInitialHelpMenu(client || interaction.client));
    } catch (error) {
      logger.error('Help command failed:', error);
      await InteractionHelper.safeEditReply(interaction, {
        content: '⚠️ Could not open the Beacon command center. Try /help again.',
        embeds: [], components: [],
      });
    }
  },
};
