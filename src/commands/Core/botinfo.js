import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isAntiNukeAIConfigured, getAntiNukeAIModel } from '../../services/aiSecurityService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Shows information and runtime statistics about Beacon'),

    async execute(interaction) {
        const client = interaction.client;
        const memory = process.memoryUsage();
        const uptime = Math.floor(process.uptime());
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const embed = createEmbed({
            title: '🤖 Beacon',
            description: 'A modular Discord community, moderation and server-management bot.',
            color: 'primary',
            thumbnail: client.user?.displayAvatarURL?.({ size: 512 }),
            fields: [
                { name: '🏠 Servers', value: String(client.guilds.cache.size), inline: true },
                { name: '👥 Cached Users', value: String(client.users.cache.size), inline: true },
                { name: '📦 Commands', value: String(client.commands?.size ?? 0), inline: true },
                { name: '⚡ API Latency', value: String(Math.max(0, Math.round(client.ws.ping))) + 'ms', inline: true },
                { name: '⏱️ Process Uptime', value: days + 'd ' + hours + 'h ' + minutes + 'm', inline: true },
                { name: '🧠 Memory', value: Math.round(memory.rss / 1024 / 1024) + ' MB RSS', inline: true },
                { name: '🟢 Node.js', value: process.version, inline: true },
                { name: '📚 discord.js', value: 'v14', inline: true },
                { name: '🛡️ AI Anti-Nuke', value: isAntiNukeAIConfigured() ? `Enabled • ${getAntiNukeAIModel()}` : 'Local adaptive mode', inline: true },
            ],
        }).setFooter({ text: 'Beacon • Built for Discord communities' }).setTimestamp();

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    },
};