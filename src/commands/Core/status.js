import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getRegisteredCommandCount } from '../../utils/commandCounts.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isBotOwner } from '../../config/bot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check Beacon gateway health, uptime and database connectivity')
    .setDMPermission(false),
  category: 'Core',
  async execute(interaction) {
    const client = interaction.client;
    const owner = isBotOwner(interaction.user.id);
    const db = client.db?.getStatus?.() || { connectionType: 'none', isDegraded: true };
    const pg = client.db?.db;
    const dbReady = !db.isDegraded && db.connectionType === 'postgresql' && pg?.isAvailable?.();
    const gatewayPing = Number.isFinite(client.ws?.ping) && client.ws.ping >= 0
      ? Math.round(client.ws.ping) : null;
    const discordReady = client.isReady() && gatewayPing !== null;
    const healthy = Boolean(discordReady && dbReady);
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor(uptime % 86400 / 3600);
    const minutes = Math.floor(uptime % 3600 / 60);
    const uptimeLabel = [days ? days + 'd' : '', hours ? hours + 'h' : '', minutes + 'm'].filter(Boolean).join(' ');

    const embed = createEmbed({
      title: (healthy ? '🟢' : '🟠') + ' Beacon • System Status',
      description: healthy
        ? '**All core services operational.**\nBeacon is connected and responding normally.'
        : '**Degraded service detected.**\nOne or more core services need attention.',
      color: healthy ? 'success' : 'warning',
      fields: [
        { name: '📡 Discord Gateway', value: discordReady ? '🟢 Online • ' + gatewayPing + ' ms' : '🔴 Unavailable', inline: true },
        { name: '🗄️ Database', value: dbReady ? '🟢 PostgreSQL • Connected' : '🟠 Unavailable or degraded', inline: true },
        { name: '⏱️ Uptime', value: uptimeLabel, inline: true },
        { name: '🌐 Servers', value: client.guilds.cache.size.toLocaleString(), inline: true },
        { name: '📚 Commands', value: String(getRegisteredCommandCount(client)), inline: true },
        { name: '🧠 Memory Usage', value: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB', inline: true },
      ],
      footer: 'Beacon • Live health snapshot',
    });
    if (owner && !dbReady && pg?.getLastFailure) {
      const err = pg.getLastFailure();
      if (err?.message) {
        embed.addFields({ name: '🔒 Owner Diagnostics', value: String(err.message).slice(0, 900), inline: false });
      }
    }
    // Only owner-specific database failure diagnostics require a private reply.
    return InteractionHelper.safeReply(interaction, { ...(owner ? { flags: MessageFlags.Ephemeral } : {}), embeds: [embed] });
  },
};
