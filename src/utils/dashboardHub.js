import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { createEmbed } from './embeds.js';
import { BEACON_MOTTO, BEACON_TEAM_NAME, BEACON_TEAM_THANKS } from '../config/bot.js';

// Read-only navigation within /dashboard. These are deliberately not new
// commands or hidden configuration switches.
export const DASHBOARD_HUB_SECTIONS = Object.freeze([
  { value: 'hubOverview', label: 'Control Center Home', description: 'Return to your main server overview', emoji: '🏠' },
  { value: 'hubSafety', label: 'Security & Health', description: 'See protections and next diagnostic steps', emoji: '🛡️' },
  { value: 'hubCommunity', label: 'Community & Growth', description: 'Welcome, reaction roles and progression', emoji: '👥' },
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
        { name: 'More', value: 'Configure **Join to Create**, **/poll** or **/suggest** for your community.', inline: false },
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
        { name: 'Feedback Matters', value: 'We read suggestions and bug reports. Use **/support** to contact the team or **/help** to explore Beacon.', inline: false },
        { name: 'Signed', value: 'With appreciation, **' + BEACON_TEAM_NAME + '** 💜', inline: false },
      ],
    },
  };
  const data = sections[section];
  if (!data) return null;
  const embed = createEmbed({
    ...data, color: 'primary',
    footer: 'Beacon • Read-only Control Center preview • Use the main dashboard to make changes',
  });
  const components = section === 'hubTeam'
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Beacon Support').setStyle(ButtonStyle.Link)
          .setURL('https://discord.gg/76N2EM6v6k').setEmoji('💬'),
      )]
    : [];
  return { embeds: [embed], components };
}
