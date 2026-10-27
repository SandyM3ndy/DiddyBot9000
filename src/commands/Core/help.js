import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { createSelectMenu } from '../../utils/components.js';
import { formatCategoryName, getCategoryIcon } from '../../config/commands/commandCategories.js';
import { searchBeaconCommandsByIntent, resolveMovedSlashCommand } from '../../utils/helpSearch.js';
import { getRegisteredCommands } from '../../handlers/help/helpSelectMenus.js';
import { BEACON_TEAM_NAME, BEACON_VERSION_LABEL } from '../../config/bot.js';
import { getBeaconInviteUrl } from './invite.js';

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
    { label: '🚀 Start Here', description: 'Guided setup for owners, staff and members', value: 'help-quickstart', emoji: '🚀' },
    { label: 'All Commands', description: 'Explore everything Beacon can do', value: 'help-all-commands', emoji: '📚' },
    ...[...categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => ({
      label: formatCategoryName(category).slice(0, 100),
      description: String(count) + ' commands • ' + (category === 'BotOwner' ? 'Beacon developer only' : 'Browse tools and features'),
      value: category,
      emoji: getCategoryIcon(category),
    })),
  ].slice(0, 25);

  const embed = createEmbed({
    title: '✦ Beacon ' + BEACON_VERSION_LABEL + ' | Command Center',
    description: [
      '**Your community\'s all-in-one Discord assistant.**',
      'Global server rankings, rotating quests, moderation, tickets and security — all in Beacon.', 
      '',
      '**/dashboard is your Main Control Center.** Use **Start Here** for a guided tour, or explore commands below.',
    ].join('\n'),
    color: 'primary',
    thumbnail: client?.user?.displayAvatarURL?.({ size: 256 }) || null,
    fields: [
      { name: '📚 Commands', value: String(commands), inline: true },
      { name: '🗂️ Categories', value: String(categories.size), inline: true },
      { name: '🛡️ Security', value: 'Moderation & Anti-Nuke', inline: true },
      { name: '🚀 Get started', value: '**/progression overview** — Explore quests, rankings and server XP\n**/dashboard** — Configure your community (including Welcome & Goodbye)\n**/diagnose** — Check setup and permissions', inline: false },
      { name: '🎯 Community Progression', value: '**/progression quests** — Daily challenges\n**/progression weekly** — Weekly goals\n**/progression leaderboard** — Global server rankings\n**/sandcoins wallet** — Global quest earnings\n**/sandcoins shop** — Server rank-card decorations', inline: false },
      { name: '🧰 Administration', value: '**/roleaudit** — Review powerful server roles\n**/ticket stats** — Track your support workload', inline: false },
      { name: '🧭 Moved Commands', value: 'Looking for an old shortcut? Use **/help search** and enter its old name, such as `heist`, `daily` or `play`.', inline: false },
      { name: '👑 Developer tools', value: 'The **Bot Owner** category contains commands reserved for Beacon’s creator. Server owners and moderators can manage their own communities normally.', inline: false },
      { name: '💜 Thank You', value: 'Thank you for making Beacon part of your server. Your feedback helps us keep improving. — **' + BEACON_TEAM_NAME + '**', inline: false },
    ],
    footer: 'Beacon • Explore the categories below',
  });
  const supportButton = new ButtonBuilder()
    .setLabel('Official Support Server')
    .setEmoji('💬')
    .setURL(SUPPORT_URL)
    .setStyle(ButtonStyle.Link);
  const startButton = new ButtonBuilder()
    .setCustomId('help-quickstart')
    .setLabel('Start Here')
    .setEmoji('🚀')
    .setStyle(ButtonStyle.Primary);
  const actions=[startButton,supportButton];
  // The former /invite action now lives in the Help Center and /botinfo.
  const clientId=client?.user?.id || client?.config?.bot?.clientId;
  if (/^\d{17,20}$/.test(String(clientId || ''))) {
    actions.push(new ButtonBuilder()
      .setLabel('Invite Beacon').setEmoji('🚀')
      .setURL(getBeaconInviteUrl(clientId)).setStyle(ButtonStyle.Link));
  }
  const components = [new ActionRowBuilder().addComponents(...actions)];
  if (options.length) {
    components.push(createSelectMenu('help-category-select', '📚 Select a command category...', options));
  }
  return { embeds: [embed], components };
}

export function searchBeaconCommands(client, query) {
  return searchBeaconCommandsByIntent(client?.commands?.values?.() || [], query);
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
        const activeClient = client || interaction.client;
        const moved=resolveMovedSlashCommand(query);
        if(moved){
          return InteractionHelper.safeEditReply(interaction,{
            embeds:[createEmbed({
              title:'🧭 This command moved',
              description:'The standalone **'+query.replace(/[@*_~<>|]/g,'').slice(0,70)+
                '** was retired to reduce slash-menu clutter.\n\n**Use '+moved.command+' instead.**\n'+moved.steps,
              color:'info',
              footer:'Beacon • Features were merged, not deleted',
            })],
            components:[],
          });
        }
        const matched = searchBeaconCommands(activeClient, query);
        const items = matched.slice(0, 15);
        const registered = await getRegisteredCommands(activeClient);
        const embed = createEmbed({
          title: '🔎 Beacon • Command Search',
          description: matched.length
            ? '**' + matched.length + ' match(es)** for "' + query.replace(/@/g,'@\u200b') + '"\n' +
              (matched.length > items.length ? 'Showing the first 15. Try a more specific search.' : 'Run a command below or click its Discord slash-command mention.')
            : 'No command matched "' + query.replace(/@/g,'@\u200b') + '". Try searching for a goal such as "support queue", "daily goals" or "reaction roles".',
          color: 'primary',
          fields: items.map(x => ({
            name: ((registered.get(x.baseName)?.id ? '</' + x.name + ':' + registered.get(x.baseName).id + '>' : '/' + x.name) + ' • ' + x.category).slice(0,256),
            value: (x.description + (x.ownerOnly ? '\n👑 Bot Owner Only' : '')).slice(0,1024),
            inline: false,
          })),
          footer: 'Beacon • Command Center • Search installed commands',
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
