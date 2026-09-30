import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';
import ticketDashboard from '../Ticket/modules/ticket_dashboard.js';
import commandsDashboard from './modules/commands_dashboard.js';
import loggingDashboard from '../Logging/modules/logging_dashboard.js';
import greetDashboard from '../Welcome/modules/greet_dashboard.js';
import { openDashboardFeature } from './modules/dashboardFeaturePanels.js';

const DASHBOARD_CUSTOM_ID = 'dashboard_select';
const WIZARD_BUTTON_ID = 'dashboard_setup_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. Right-click this server\'s name (mobile: tap the server name at the top).',
    '2. Open **Privacy Settings**.',
    '3. Turn on **Allow direct messages from server members**.',
    '4. Click **Quick Setup** again.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Quick Setup Started',
            'Check your DMs — I sent you the first setup question there.\n\nAnswer each question in that DM. Type `skip` to keep the current value.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `I couldn't send you a DM. Enable DMs from this server, then try again.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) return '`Not set`';
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) return '`Not set`';
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) return '`Not configured`';

    const typeLabels = ['Playing', 'Streaming', 'Listening to', 'Watching', '', 'Competing in'];
    const typeLabel = typeLabels[activity.type];
    return typeLabel ? `${typeLabel} **${activity.name}**` : activity.name;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primary \`${colors.primary}\` · Success \`${colors.success}\``,
        `⚠️ Warning \`${colors.warning}\` · Error \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ Server Configuration',
        description: `Core settings for **${guild.name}**. Pick an option below or run the setup wizard.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Server Prefix',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Moderator Role',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Log Channel',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '🛡️ AutoMod',
                value: config.autoModEnabled ? '🟢 Basic protection enabled' : '🔴 Disabled',
                inline: true,
            },
            {
                name: '📈 Server Progression',
                value: config.serverProgression?.enabled ? '🟢 Enabled' : '🔴 Disabled',
                inline: true,
            },
            {
                name: '📢 Update Announcements',
                value: config.updates?.channelId ? `🟢 ${formatChannelMention(guild, config.updates.channelId)}` : '🔴 Disabled',
                inline: true,
            },
            {
                name: '💚 Bot Status',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Embed Theme',
                value: `${getThemeColorLines()}\n-# Colors are set in bot config and apply globally.`,
                inline: false,
            },
            {
                name: '⚡ Command Access',
                value: 'Use `/commands dashboard` to enable or disable commands and subcommands.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} Setup`,
                value: setupDone
                    ? 'Setup wizard completed — re-run anytime to update settings.'
                    : 'Setup wizard has not been completed yet — run the setup wizard to configure Beacon.',
                inline: false,
            },
        ],
        footer: 'Dashboard closes after 10 minutes of inactivity',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Select a setting to configure...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Server Prefix').setDescription('Change the text command prefix').setValue('prefix').setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder().setLabel('Moderator Role').setDescription('Role used for moderation commands').setValue('modRole').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('Command Access').setDescription('Enable or disable commands and subcommands').setValue('commandAccess').setEmoji('⚡'),
                new StringSelectMenuOptionBuilder().setLabel('Logging').setDescription('Configure log channels, events and filters').setValue('logging').setEmoji('📝'),
                new StringSelectMenuOptionBuilder().setLabel('Welcome & Goodbye').setDescription('Configure member welcome and goodbye messages').setValue('welcome').setEmoji('👋'),
                new StringSelectMenuOptionBuilder().setLabel('Ticket System').setDescription('Configure tickets, staff, categories, logs and transcripts').setValue('ticketSystem').setEmoji('🎫'),
                new StringSelectMenuOptionBuilder().setLabel('Join to Create').setDescription('Configure temporary voice channel creation').setValue('joinToCreate').setEmoji('🔊'),
                new StringSelectMenuOptionBuilder().setLabel('Reaction Roles').setDescription('Create and manage reaction-role panels').setValue('reactionRoles').setEmoji('🎭'),
                new StringSelectMenuOptionBuilder().setLabel('AutoMod').setDescription('Configure Beacon\'s basic automatic protection').setValue('autoModEnabled').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('Server Progression').setDescription('Enable daily quests, server XP and the global leaderboard').setValue('serverProgressionEnabled').setEmoji('📈'),
                new StringSelectMenuOptionBuilder().setLabel('Update Announcements').setDescription('Choose where Beacon updates are announced').setValue('updatesChannelId').setEmoji('📢'),
                new StringSelectMenuOptionBuilder().setLabel('Log Channel').setDescription('Choose the server\'s main log channel').setValue('logChannelId').setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel('Quick Setup')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;
    const channelMention = value.match(/<#!?(\d{17,20})>/);
    if (channelMention) return channelMention[1];
    const roleMention = value.match(/<@&(\d{17,20})>/);
    if (roleMention) return roleMention[1];
    const digits = value.match(/^(\d{17,20})$/);
    return digits ? digits[1] : null;
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `dashboard_modal:${setting}:${guildId}`;

    if (setting === 'serverProgressionEnabled' || setting === 'autoModEnabled') {
        const title = setting === 'serverProgressionEnabled' ? '📈 Server Progression' : '🛡️ AutoMod';
        const modal = new ModalBuilder().setCustomId(modalCustomId).setTitle(title);
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel(`Enable ${setting === 'serverProgressionEnabled' ? 'Server Progression' : 'AutoMod'}? (on/off)`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('on')
            .setRequired(true)
            .setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'updatesChannelId') {
        const modal = new ModalBuilder().setCustomId(modalCustomId).setTitle('📢 Update Announcements');
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Channel ID / mention, or none')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('#updates or none')
            .setRequired(true)
            .setMaxLength(100);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder().setCustomId(modalCustomId).setTitle('📋 Update Log Channel');
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Select a text channel...')
            .setMinValues(1).setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);
        modal.addLabelComponents(new LabelBuilder().setLabel('Log Channel').setDescription('Channel where system log messages will be sent').setChannelSelectMenuComponent(channelSelect));
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder().setCustomId(modalCustomId).setTitle('🛡️ Update Moderator Role');
        const roleSelect = new RoleSelectMenuBuilder().setCustomId('mod_role').setPlaceholder('Select a moderator role...').setMinValues(1).setMaxValues(1).setRequired(true);
        modal.addLabelComponents(new LabelBuilder().setLabel('Moderator Role').setDescription('Role used for moderation commands').setRoleSelectMenuComponent(roleSelect));
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder().setCustomId(modalCustomId).setTitle('Update Server Prefix');
    const textInput = new TextInputBuilder().setCustomId('value').setLabel('New prefix (1-10 characters, no spaces)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(10);
    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'serverProgressionEnabled' || setting === 'autoModEnabled') {
        const value = submitted.fields.getTextInputValue('value')?.trim().toLowerCase();
        if (!['on', 'off'].includes(value)) throw new Error('Reply with `on` or `off`.');
        return value === 'on';
    }
    if (setting === 'updatesChannelId') {
        const value = submitted.fields.getTextInputValue('value')?.trim();
        if (!value) throw new Error('Provide a channel mention, channel ID, or `none`.');
        if (value.toLowerCase() === 'none') return null;
        const channelId = extractId(value);
        if (!channelId) throw new Error('Provide a valid channel mention or ID from this server, or `none`.');
        return channelId;
    }
    if (setting === 'logChannelId') {
        const channelId = submitted.fields.getField('log_channel')?.values?.[0];
        if (!channelId) throw new Error('Please select a log channel.');
        return channelId;
    }
    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) throw new Error('Please select a moderator role.');
        return roleId;
    }
    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) throw new Error('Prefix must be 1-10 characters with no spaces.');
    return prefix;
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'serverProgressionEnabled') return `Server Progression is now **${value ? 'enabled' : 'disabled'}**. Daily quests and server XP are ${value ? 'active' : 'paused'}.`;
    if (setting === 'autoModEnabled') return `Basic AutoMod is now **${value ? 'enabled' : 'disabled'}**.`;
    if (setting === 'updatesChannelId') return value === null ? 'Update announcements are now **disabled** for this server.' : `Bot update announcements will now be posted in ${guild.channels.cache.get(value) ?? `<#${value}>`}.`;
    if (setting === 'logChannelId') return `Log channel set to ${guild.channels.cache.get(value) ?? `<#${value}>`}.`;
    if (setting === 'modRole') return `Moderator role set to ${guild.roles.cache.get(value) ?? `<@&${value}>`}.`;
    return `Server prefix set to \`${value}\`.`;
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `dashboard_modal:${setting}:${guildId}`;
    const submitted = await selectInteraction.awaitModalSubmit({
        filter: modalInteraction => modalInteraction.customId === modalCustomId && modalInteraction.user.id === selectInteraction.user.id,
        time: 120_000,
    }).catch(() => null);
    if (!submitted) return;

    try {
        if (setting === 'serverProgressionEnabled' && submitted.guild?.ownerId !== submitted.user.id) {
            throw new Error('Only the server owner can enable or disable Server Progression.');
        }
        let value = resolveSettingModalValue(setting, submitted);
        if (setting === 'updatesChannelId' && value !== null) value = await validateGuildChannelId(submitted.guild, value);
        const configKey = setting === 'serverProgressionEnabled' ? 'serverProgression' : setting === 'updatesChannelId' ? 'updates' : setting;
        const configValue = setting === 'serverProgressionEnabled' ? { enabled: value } : setting === 'updatesChannelId' ? { channelId: value } : value;
        await ConfigService.updateSetting(client, guildId, configKey, configValue, submitted.user.id);
        await submitted.reply({ embeds: [successEmbed('Configuration Updated', buildSettingSuccessMessage(setting, value, submitted.guild))], flags: MessageFlags.Ephemeral });
        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Dashboard modal submit error:', error);
        await replyUserError(submitted, { type: ErrorTypes.CONFIGURATION, message: error.message || 'Please try again.' }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder().setName('dashboard').setDescription('Open the Beacon server dashboard').setDMPermission(false),
    category: 'Core',
    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) return;
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to use this command.' });
            }
            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [buildButtonRow(guildConfig, interaction.guildId), buildSettingsSelect(interaction.guildId)] });
            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) return;
            const componentCollector = replyMessage.createMessageComponentCollector({ filter: componentInteraction => componentInteraction.user.id === interaction.user.id && componentInteraction.customId.includes(`:${interaction.guildId}`), time: 600_000 });

            componentCollector.on('collect', async componentInteraction => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();
                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }
                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        if (selected === 'serverProgressionEnabled' && interaction.guild.ownerId !== componentInteraction.user.id) {
                            await replyUserError(componentInteraction, { type: ErrorTypes.PERMISSION, message: 'Only the **server owner** can enable or disable Server Progression.' });
                            return;
                        }
                        if (selected === 'commandAccess') {
                            componentCollector.stop('command_access');
                            await commandsDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client);
                            return;
                        }
                        if (selected === 'logging') {
                            componentCollector.stop('logging');
                            await loggingDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client);
                            return;
                        }
                        if (selected === 'welcome') {
                            componentCollector.stop('welcome');
                            await greetDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client);
                            return;
                        }
                        if (selected === 'ticketSystem') {
                            componentCollector.stop('ticket_system');
                            await ticketDashboard.execute(interaction, await getGuildConfig(interaction.client, interaction.guildId), interaction.client);
                            return;
                        }
                        if (selected === 'joinToCreate' || selected === 'reactionRoles') {
                            componentCollector.stop(selected);
                            await openDashboardFeature(selected, interaction);
                            return;
                        }
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(componentInteraction, interaction, selected, interaction.guildId, interaction.client);
                    }
                } catch (error) {
                    logger.error('Dashboard interaction error:', error);
                    await replyUserError(componentInteraction, { type: ErrorTypes.UNKNOWN, message: 'Failed to process your selection. Please try again.' }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Dashboard command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to open the server dashboard. Please try again.' }).catch(() => {});
        }
    },
};
