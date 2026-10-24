import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const DASHBOARD_HOME_ID = 'beacon_home';

/** Give every settings panel an escape route without exceeding Discord's five-row limit. */
export function withDashboardHome(components = []) {
  const rows = [...components];
  if (rows.length >= 5 || rows.some(row => row.components?.some(c => c.data?.custom_id === DASHBOARD_HOME_ID))) {
    return rows;
  }
  return [...rows, new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(DASHBOARD_HOME_ID).setLabel('Back to Main Dashboard')
      .setEmoji('🏠').setStyle(ButtonStyle.Secondary),
  )];
}
