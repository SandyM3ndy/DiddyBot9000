import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import commandsDashboard from './modules/commands_dashboard.js';
import loggingDashboard from '../Logging/modules/logging_dashboard.js';
import greetDashboard from '../Welcome/modules/greet_dashboard.js';
import ticketDashboard from '../Ticket/modules/ticket_dashboard.js';
import { openDashboardFeature } from './modules/dashboardFeaturePanels.js';

const SELECT_ID = 'beacon_dashboard_select';
const REFRESH_ID = 'beacon_dashboard_refresh';

function channel(guild, id) {
    if (!id) return '`Not set`';
    return guild.channels.cache.has(id) ? `<#${id}>` : `#${id}`;
}

function role(guild, id) {
    if (!id) return '`Not set`';
    return guild.roles.cache.has(id) ? `<@&${id}>` : `@${id}`;
}

function presence() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) return '`Not configured`';
    const labels = ['Playing', 'Streaming', 'Listening to', 'Watching', '', 'Competing in'];
    return `${labels[activity.type] || ''}${labels[activity.type] ? ' ' : ''}**${activity.name}**`;
}

function dashboardEmbed(config, guild) {
    const colors = botConfig.embeds.colors;
    return createEmbed({
        title: 'Beacon',
        description: `⚙️ **Server Configuration**\n\nCore settings for **${guild.name}**. Use the menu below to configure Beacon.`,
        color: 'info',
        fields: [
            { name: '⌨️ Server Prefix', value: `\`${config.prefix || getCommandPrefix()}\``, inline: true },
            { name: '🛡️ Moderator Role', value: role(guild, config.modRole), inline: true },
            { name: '📋 Log Channel', value: channel(guild, config.logging?.channels?.audit), inline: true },
            { name: '🛡️ AutoMod', value: config.autoModEnabled ? '🟢 Basic protection enabled' : '🔴 Disabled', inline: true },
            { name: '📈 Server Progression', value: config.serverProgression?.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
            { name: '📢 Update Announcements', value: config.updates?.channelId ? `🟢 ${channel(guild, config.updates.channelId)}` : '🔴 Disabled', inline: true },
            { name: '💚 Bot Status', value: presence(), inline: false },
            { name: '🎨 Embed Theme', value: `🎨 Primary \`${colors.primary}\` · Success \`${colors.success}\`\n⚠️ Warning \`${colors.warning}\` · Error \`${colors.error}\`\n-# Colors are set in bot config and apply globally.`, inline: false },
            { name: '⚡ Command Access', value: 'Manage enabled commands and categories directly from this dashboard.', inline: false },
            { name: '🧩 Server Features', value: 'Logging, Welcome & Goodbye, Tickets, Join to Create, and Reaction Roles are all managed here.', inline: false },
            { name: config.setupWizardCompleted ? '✅ Setup' : '📝 Setup', value: config.setupWizardCompleted ? 'Core setup completed. All server configuration is managed here.' : 'Configure Beacon using the sections below.', inline: false },
        ],
        footer: 'Dashboard closes after 10 minutes of inactivity',
    });
}

function menu(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${SELECT_ID}:${guildId}`)
            .setPlaceholder('⚙️ Configure Beacon...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Command Access').setDescription('Enable or disable commands and categories').setValue('commands').setEmoji('🛠️'),
                new StringSelectMenuOptionBuilder().setLabel('Logging').setDescription('Configure logs, channels and event categories').setValue('logging').setEmoji('📝'),
                new StringSelectMenuOptionBuilder().setLabel('Welcome & Goodbye').setDescription('Configure member join and leave messages').setValue('welcome').setEmoji('👋'),
                new StringSelectMenuOptionBuilder().setLabel('Ticket System').setDescription('Configure tickets, staff, transcripts and limits').setValue('tickets').setEmoji('🎫'),
                new StringSelectMenuOptionBuilder().setLabel('Join to Create').setDescription('Configure temporary voice channels').setValue('jtc').setEmoji('🔊'),
                new StringSelectMenuOptionBuilder().setLabel('Reaction Roles').setDescription('Create and manage reaction-role panels').setValue('reactionroles').setEmoji('🎭'),
                new StringSelectMenuOptionBuilder().setLabel('Server Prefix').setDescription('Change the text-command prefix').setValue('prefix').setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder().setLabel('Moderator Role').setDescription('Choose the server moderator role').setValue('modrole').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('AutoMod').setDescription('Enable or disable basic protection').setValue('automod').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('Server Progression').setDescription('Enable or disable server progression').setValue('progression').setEmoji('📈'),
                new StringSelectMenuOptionBuilder().setLabel('Update Announcements').setDescription('Choose the update announcement channel').setValue('updates').setEmoji('📢'),
                new StringSelectMenuOptionBuilder().setLabel('Log Channel').setDescription('Choose the main log channel').setValue('logchannel').setEmoji('📋'),
            ),
    );
}

function buttons(guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${REFRESH_ID}:${guildId}`).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    );
}

async function show(interaction, guildConfig) {
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [dashboardEmbed(guildConfig, interaction.guild)],
        components: [buttons(interaction.guildId), menu(interaction.guildId)],
    });
}

async function handleSimpleSetting(interaction, selected, client, guildId) {
    const current = await getGuildConfig(client, guildId);
    if (selected === 'automod') {
        const value = !current.autoModEnabled;
        await ConfigService.updateSetting(client, guildId, 'autoModEnabled', value, interaction.user.id);
        return `Basic AutoMod is now **${value ? 'enabled' : 'disabled'}**.`;
    }
    if (selected === 'progression') {
        if (interaction.guild.ownerId !== interaction.user.id) throw new Error('Only the server owner can change Server Progression.');
        const value = !current.serverProgression?.enabled;
        await ConfigService.updateSetting(client, guildId, 'serverProgression', { enabled: value }, interaction.user.id);
        return `Server Progression is now **${value ? 'enabled' : 'disabled'}**.`;
    }
    throw new Error('That setting requires the dedicated dashboard panel.');
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder().setName('dashboard').setDescription('Open the Beacon server dashboard').setDMPermission(false),
    category: 'Core',
    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to use this command.' });
            }
            await show(interaction, await getGuildConfig(interaction.client, interaction.guildId));
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                time: 600_000,
                filter: i => i.user.id === interaction.user.id && i.customId.endsWith(`:${interaction.guildId}`),
            });
            collector.on('collect', async component => {
                try {
                    if (component.isButton()) {
                        await component.deferUpdate();
                        await show(interaction, await getGuildConfig(interaction.client, interaction.guildId));
                        return;
                    }
                    if (!component.isStringSelectMenu()) return;
                    const selected = component.values[0];
                    if (selected === 'commands') { collector.stop('commands'); return commandsDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client); }
                    if (selected === 'logging') { collector.stop('logging'); return loggingDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client); }
                    if (selected === 'welcome') { collector.stop('welcome'); return greetDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client); }
                    if (selected === 'tickets') { collector.stop('tickets'); return ticketDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client); }
                    if (selected === 'jtc') { collector.stop('jtc'); return openDashboardFeature('joinToCreate', interaction); }
                    if (selected === 'reactionroles') { collector.stop('reactionroles'); return openDashboardFeature('reactionRoles', interaction); }
                    if (selected === 'automod' || selected === 'progression') {
                        const result = await handleSimpleSetting(component, selected, interaction.client, interaction.guildId);
                        await component.reply({ embeds: [successEmbed('Configuration Updated', result)], flags: MessageFlags.Ephemeral });
                        await show(interaction, await getGuildConfig(interaction.client, interaction.guildId));
                        return;
                    }
                    await component.reply({ embeds: [warningEmbed('Configuration', 'Use the dedicated configuration panel for this setting.')], flags: MessageFlags.Ephemeral });
                } catch (error) {
                    logger.error('Beacon dashboard interaction error:', error);
                    await replyUserError(component, { type: ErrorTypes.CONFIGURATION, message: error.message || 'Failed to process that dashboard option.' }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Beacon dashboard error:', error);
            await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Failed to open the Beacon dashboard.' }).catch(() => {});
        }
    },
};
