import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { createEmbed } from './embeds.js';
import { BEACON_MOTTO, BEACON_TEAM_NAME, BEACON_TEAM_THANKS } from '../config/bot.js';
import { BEACON_IDENTITY } from '../config/beaconIdentity.js';

// Read-only navigation within /dashboard. These are deliberately not new
// commands or hidden configuration switches.
export const DASHBOARD_HUB_SECTIONS = Object.freeze([
  { value: 'hubOverview', label: 'Control Center Home', description: 'Return to your main server overview', emoji: '🏠' },
  { value: 'hubSafety', label: 'Security & Health', description: 'See protections and next diagnostic steps', emoji: '🛡️' },
  { value: 'hubCommunity', label: 'Community & Growth', description: 'Welcome, reaction roles and progression', emoji: '👥' },
  { value: 'hubNetwork', label: 'The Beacon Network', description: 'Progression, Sand Coins, careers and rank cards', emoji: '🌐' },
  { value: 'hubSupport', label: 'Tickets & Support', description: 'Your support setup, inbox and privacy', emoji: '🎫' },
  { value: 'hubTeam', label: 'Beacon Development Team', description: 'About Beacon, support and a thank-you', emoji: '💜' },
]);

export function buildDashboardHubMenu(guildId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dashboard_hub:' + guildId)
      .setPlaceholder('🧭 Explore your Control Center...')
      .addOptions(DASHBOARD_HUB_SECTIONS.map(({ value, label, description, emoji }) =>
        ({ value, label, description, emoji }))),
  );
}

function channel(guild, id) {
  if (!id) return 'Not configured';
  return guild?.channels?.cache?.has?.(id) ? '<#' + id + '>' : 'Saved channel (not cached)';
}

export function buildDashboardHubPanel(section, config = {}, guild = {}) {
  const name = String(guild.name || 'your server').replace(/@/g, '@\u200b').slice(0, 80);
  const sections = {
    hubSafety: {
      title: '🛡️ Beacon • Security & Health',
      description: '**' + name + '** — a quick security overview from saved configuration.\n' +
        'This is **not** a live permission audit. Run **/diagnose** and **/roleaudit** to verify access and identify risky roles.',
      fields: [
        { name: 'Anti-Nuke & Moderator Tools', value: 'Open **/antinuke** to manage protection and **/cases** for moderation records.', inline: false },
        { name: 'AutoMod', value: config.autoModEnabled ? 'Enabled' : 'Not enabled', inline: true },
        { name: 'Logging', value: config.logging?.enabled ? 'Enabled' : 'Not enabled', inline: true },
        { name: 'Audit Channel', value: channel(guild, config.logging?.channels?.audit), inline: true },
        { name: 'Next Step', value: 'Use the **settings** menu in /dashboard for AutoMod, Command Access and Logging. Run **/diagnose** before enabling powerful permissions.', inline: false },
      ],
    },
    hubCommunity: {
      title: '👥 Beacon • Community & Growth',
      description: '**' + name + '** — welcome members, give them choices, and celebrate community milestones.',
      fields: [
        { name: 'Welcome & Goodbye', value: 'Choose **Welcome & Goodbye** in the dashboard settings menu.', inline: false },
        { name: 'Reaction Roles', value: 'Choose **Reaction Roles** in the dashboard menu, or run **/reactroles studio** to preview panels.', inline: false },
        { name: 'Server Progression', value: config.serverProgression?.enabled
          ? '🟢 Enabled — use **/progression overview**, **/progression quests** and **/progression weekly**.'
          : '⚪ Optional — the server owner can enable it in dashboard settings.', inline: false },
        { name: '🪙 Sand Coins & Rank Card Shop', value: 'Members earn **global Sand Coins** from shared quest contributions and can purchase decorations for this server with **/sandcoins shop**. View ownership with **/sandcoins inventory**. Only the owner or **Manage Server** admins can equip items using **/sandcoins equip**. Purchases are sent to the configured audit channel.', inline: false },
        { name: 'More', value: 'Play **/sandcoins dispatch** for personal careers, **/treasury** for optional community competition, or configure **Join to Create**, **/poll** and **/suggest**.', inline: false },
      ],
    },
    hubNetwork: {
      title: '🌐 Beacon • The Connected Network',
      description: '**'+name+'** is a community of its own, connected to a wider Beacon experience.\n\n'+BEACON_IDENTITY.networkIntro,
      fields: [
        {name:'🛡️ Protect',value:'**/dashboard** manages protection and setup. **/cases** keeps moderation records and staff notes in one place.'},
        {name:'🚀 Grow',value:'**/progression overview** tracks goals and shared progress. **/rank card** presents server achievements to the wider network.'},
        {name:'🪙 Reward',value:'**/sandcoins wallet** is global. **/sandcoins dispatch** saves a personal career. **/sandcoins shop** buys cosmetics for this server’s rank card.'},
        {name:'🔗 How It Connects',value:BEACON_IDENTITY.networkJourney},
        {name:'🏦 Compete by Choice',value:'**/treasury** manages optional Treasury Wars. Viewing the network does not opt a server in or move its coins.'},
        {name:'Independent Communities',value:'Each server keeps its own rules, security and progression privacy. Global wallet activity does not give members extra staff permissions.'},
      ],
    },
    hubSupport: {
      title: '🎫 Beacon • Tickets & Support',
      description: '**' + name + '** — keep staff support organised and private.',
      fields: [
        { name: 'Ticket Panel', value: channel(guild,config.ticketPanelChannelId), inline: true },
        { name: 'Private Transcript Archive', value: channel(guild,config.ticketTranscriptChannelId), inline: true },
        { name: 'Ticket Team', value: config.ticketStaffRoleId ? 'Configured' : 'Not configured', inline: true },
        { name: 'Manage Tickets', value: 'Choose **Ticket System** from the main dashboard settings menu. Authorised staff can use **/ticket queue** and **/ticket stats**.', inline: false },
        { name: 'Privacy Reminder', value: 'Use **/diagnose** to check transcript channel permissions before storing sensitive conversations.', inline: false },
      ],
    },
    hubTeam: {
      title: '💜 A Message from the Beacon Development Team',
      description: '**' + BEACON_MOTTO + '**\n\n' + BEACON_TEAM_THANKS,
      fields: [
        { name: 'Our Promise', value: 'Clear tools, thoughtful design and dependable support — while respecting each server’s own settings and community.', inline: false },
        { name: 'Feedback Matters', value: 'Find the official support server in **/help** to share feedback or report a problem.', inline: false },
        { name: 'Signed', value: 'With appreciation, **' + BEACON_TEAM_NAME + '** 💜', inline: false },
      ],
    },
  };
  const data = sections[section];
  if (!data) return null;
  const embed = createEmbed({
    ...data, color: 'primary',
    footer: 'Beacon Network • Read-only preview • Configure from Beacon HQ',
  });
  const components = section === 'hubTeam'
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Beacon Support').setStyle(ButtonStyle.Link)
          .setURL('https://discord.gg/76N2EM6v6k').setEmoji('💬'),
      )]
    : [];
  return { embeds: [embed], components };
}
