import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show DiddyBot9000 system and database health')
    .setDMPermission(false),
  category: 'Core',

  async execute(interaction) {
    const client = interaction.client;
    const dbStatus = client.db?.getStatus?.() || {
      connectionType: 'none',
      isDegraded: true,
      degradedReason: 'Database not initialized'
    };

    const pg = client.db?.db;
    const pgAvailable = Boolean(pg?.isAvailable?.());
    const wsPing = client.ws?.ping;
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    const formatUptime = (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return [
        days ? `${days}d` : '',
        hours ? `${hours}h` : '',
        minutes ? `${minutes}m` : '',
        `${secs}s`
      ].filter(Boolean).join(' ');
    };

    const databaseHealthy = !dbStatus.isDegraded && pgAvailable;
    const discordHealthy = client.isReady() && Number.isFinite(wsPing) && wsPing >= 0;
    const overallHealthy = databaseHealthy && discordHealthy;

    const embed = createEmbed({
      title: `${overallHealthy ? '🟢' : '🟠'} DiddyBot9000 Status`,
      description: overallHealthy
        ? 'All critical services are operating normally.'
        : 'One or more services need attention.',
      color: overallHealthy ? 'success' : 'warning',
    }).addFields(
      { name: '💬 Discord', value: discordHealthy ? `Online • ${wsPing}ms` : 'Unavailable', inline: true },
      { name: '🗄️ Database', value: databaseHealthy ? `PostgreSQL • Connected` : `Degraded • ${dbStatus.degradedReason || 'Unavailable'}`, inline: true },
      { name: '⏱️ Uptime', value: formatUptime(uptimeSeconds), inline: true },
      { name: '🌐 Servers', value: `${client.guilds.cache.size.toLocaleString()}`, inline: true },
      { name: '📦 Commands', value: `${client.commands?.size ?? 0}`, inline: true },
      { name: '🧠 Memory', value: `${Math.round(memory.rss / 1024 / 1024)} MB RSS`, inline: true },
    ).setFooter({
      text: `Node.js ${process.version} • Last checked`
    });

    if (pg?.getLastFailure) {
      const failure = pg.getLastFailure();
      if (failure?.message) {
        embed.addFields({
          name: '⚠️ Last Database Failure',
          value: `\`${String(failure.message).slice(0, 1000)}\``,
          inline: false,
        });
      }
    }

    return InteractionHelper.safeReply(interaction, {
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    });
  },
};
