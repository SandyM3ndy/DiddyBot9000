import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../embeds.js';
import { getColor } from '../../config/bot.js';
import { pageWarnings } from './warningPages.js';

export function buildWarningsView({ warnings, target, viewerId, page = 1 }) {
  const view = pageWarnings(warnings, page);
  const targetId = typeof target === 'string' ? target : target.id;
  const targetName = typeof target === 'string' ? `<@${targetId}>`
    : (target?.tag || target?.username || `<@${targetId}>`);
  const embed = createEmbed({
    title: `⚠️ Warnings: ${targetName}`,
    description: view.count
      ? `**${view.count}** active warning(s) • Page **${view.page}/${view.totalPages}**\nDelete using the warning numbers shown below.`
      : 'This member has no recorded warnings.',
  }).setColor(getColor(view.count ? 'warning' : 'success'));

  for (const { warning, number } of view.items) {
    const reason = String(warning?.reason || 'No reason recorded').replace(/[\r\n]+/g, ' ').slice(0, 90);
    const moderatorId = String(warning?.moderatorId || '');
    const moderator = /^\d{17,20}$/.test(moderatorId) ? `<@${moderatorId}>` : 'Unknown';
    const timestamp = Number(warning?.timestamp);
    const time = Number.isFinite(timestamp) && timestamp > 0
      ? `<t:${Math.floor(timestamp / 1000)}:F>` : 'Unknown';
    embed.addFields({ name: `#${number} — ${reason}`, value: `**Moderator:** ${moderator}\n**Date:** ${time}`, inline: false });
  }
  embed.setFooter({ text: 'Beacon • Moderation warnings' }).setTimestamp();
  if (!view.count) return { embeds: [embed], components: [] };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`warning_delete_specific:${targetId}:${viewerId}`).setLabel('Delete Specific Warning').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`warning_clear_all:${targetId}:${viewerId}`).setLabel('Clear All').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`warning_page_prev:${targetId}:${viewerId}:${view.page}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(view.page === 1),
    new ButtonBuilder().setCustomId(`warning_page_next:${targetId}:${viewerId}:${view.page}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(view.page === view.totalPages),
  );
  return { embeds: [embed], components: [row] };
}
