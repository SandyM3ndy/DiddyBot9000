import { SlashCommandBuilder, version as discordVersion } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getRegisteredCommandCount } from '../../utils/commandCounts.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isAntiNukeAIConfigured, getAntiNukeAIModel } from '../../services/aiSecurityService.js';

function displayUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? days + 'd' : '', hours ? hours + 'h' : '', minutes + 'm'].filter(Boolean).join(' ');
}

export default {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Explore Beacon features, statistics and runtime information'),
  category: 'Core',
  async execute(interaction) {
    const client = interaction.client;
    const ping = Number.isFinite(client.ws?.ping) && client.ws.ping >= 0
      ? Math.round(client.ws.ping) + ' ms' : 'Unavailable';
    const memory = process.memoryUsage();

    const embed = createEmbed({
      title: '✦ Beacon • About',
      description: '**Your community. Better protected.**\nAn all-in-one assistant for moderation, support, security and server tools.',
      color: 'primary',
      thumbnail: client.user?.displayAvatarURL?.({ size: 256 }),
      fields: [
        { name: '🌐 Servers', value: client.guilds.cache.size.toLocaleString(), inline: true },
        { name: '👥 Members (estimated)', value: client.guilds.cache.reduce((n, g) => n + (g.memberCount || 0), 0).toLocaleString(), inline: true },
        { name: '📚 Commands', value: String(getRegisteredCommandCount(client)), inline: true },
        { name: '📡 Gateway Ping', value: ping, inline: true },
        { name: '⏱️ Uptime', value: displayUptime(Math.floor(process.uptime())), inline: true },
        { name: '🧠 RAM', value: Math.round(memory.rss / 1024 / 1024) + ' MB', inline: true },
        { name: '🛡️ Anti-Nuke', value: isAntiNukeAIConfigured() ? 'AI assisted • ' + getAntiNukeAIModel() : 'Local adaptive protection', inline: false },
        { name: '🧰 Quick Start', value: '/help • Browse commands\n/dashboard • Configure your server\n/diagnose • Check setup', inline: false },
        { name: '⚙️ Runtime', value: 'Node ' + process.version + ' • discord.js ' + discordVersion, inline: false },
      ],
      footer: 'Beacon • Built for Discord communities',
    });
    return InteractionHelper.safeReply(interaction, { embeds: [embed] });
  },
};
