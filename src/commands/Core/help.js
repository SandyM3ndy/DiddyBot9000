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
      '**One bot. A better Discord community.**',
      'Moderation, security, support tickets and powerful server tools.',
      '',
      'Choose a category below to browse commands and their access requirements.',
    ].join('\n'),
    color: 'primary',
    thumbnail: client?.user?.displayAvatarURL?.({ size: 256 }) || null,
    fields: [
      { name: '📚 Commands', value: String(commands), inline: true },
      { name: '🗂️ Categories', value: String(categories.size), inline: true },
      { name: '🛡️ Security', value: 'Moderation & Anti-Nuke', inline: true },
      { name: '🚀 Get started', value: '**/dashboard** — Configure your community\n**/diagnose** — Check setup and bot permissions', inline: false },
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

export default {
  slashOnly: true,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Open the Beacon command center and feature categories'),
  category: 'Core',
  async execute(interaction, config, client) {
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    try {
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
