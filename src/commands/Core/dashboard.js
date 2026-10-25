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
import { DASHBOARD_FAVOURITES, getDashboardFavourites, formatDashboardFavourites,
    updateDashboardSettingWithUndo, getDashboardUndo, undoLastDashboardSetting,
} from '../../services/dashboardExperienceService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix, BEACON_MOTTO, BEACON_TEAM_NAME, BEACON_VERSION_LABEL } from '../../config/bot.js';
import { buildDashboardHubMenu, buildDashboardHubPanel } from '../../utils/dashboardHub.js';
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
    '4. Click **Start Setup Wizard** again.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Setup Wizard Started',
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
    if (!channelId) {
        return '`Not set`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`Not set`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Not configured`';
    }

    const typeLabels = ['Playing', 'Streaming', 'Listening to', 'Watching', '', 'Competing in'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primary \`${colors.primary}\` · Success \`${colors.success}\``,
        `⚠️ Warning \`${colors.warning}\` · Error \`${colors.error}\``,
    ].join('\n');
}

export function getDashboardSetupSummary(config = {}) {
    const checks = [
        { name: 'Moderation role', ready: Boolean(config.modRole), action: 'Moderator Role' },
        { name: 'Welcome channel', ready: Boolean(config.welcomeChannelId || config.welcome?.channelId || config.channelId), action: 'Welcome & Goodbye' },
        { name: 'Ticket panel', ready: Boolean(config.ticketPanelChannelId), action: 'Ticket System' },
        { name: 'Ticket staff', ready: Boolean(config.ticketStaffRoleId), action: 'Ticket System' },
        { name: 'Private archive channel', ready: Boolean(config.ticketTranscriptChannelId), action: 'Ticket System' },
        { name: 'Audit log channel', ready: Boolean(config.logging?.channels?.audit), action: 'Logging' },
    ];
    const configured = checks.filter(check => check.ready).length;
    return { configured, total: checks.length, missing: checks.filter(check => !check.ready) };
}

export function buildDashboardEmbed(config, guild) {
    const summary = getDashboardSetupSummary(config);
    const enabled = '🟢 Enabled';
    const disabled = '⚪ Disabled';
    const setupComplete = Boolean(config.setupWizardCompleted);
    const next = summary.missing.slice(0, 3).map(item => '• **' + item.name + '** → ' + item.action).join('\n');
    const readiness = summary.configured === summary.total
        ? '✅ All core setup fields have values. Run **/diagnose** to verify actual permissions.'
        : '🧭 **' + summary.configured + '/' + summary.total + ' core settings configured**\n' +
          (next || 'Open the menu below to finish setup.');

    return createEmbed({
        title: '🏠 Beacon ' + BEACON_VERSION_LABEL + ' • Main Control Center',
        description: [
            '**' + guild.name + '**',
            '**' + BEACON_MOTTO + '**',
            'Your central place for server setup, safety, community tools and support.',
            '',
            readiness,
            '',
            setupComplete
                ? 'Your initial setup wizard was completed. You can edit individual settings below.'
                : 'New to Beacon? Use **Start Setup** for guided configuration.',
        ].join('\n'),
        color: summary.configured === summary.total ? 'success' : 'primary',
        thumbnail: guild.iconURL?.({ size: 256 }) || null,
        fields: [
            { name: '⌨️ Command Prefix', value: '\`' + (config.prefix || getCommandPrefix()) + '\`', inline: true },
            { name: '🛡️ Moderator Role', value: formatRoleMention(guild, config.modRole), inline: true },
            { name: '📋 Audit Logs', value: config.logging?.enabled
                ? formatChannelMention(guild, config.logging?.channels?.audit)
                : disabled, inline: true },
            { name: '🔒 AutoMod', value: config.autoModEnabled ? enabled : disabled, inline: true },
            { name: '📈 Progression', value: config.serverProgression?.enabled ? enabled : disabled, inline: true },
            { name: '📢 Updates', value: config.updates?.channelId
                ? formatChannelMention(guild, config.updates.channelId)
                : disabled, inline: true },
            { name: '🎫 Support', value: config.ticketPanelChannelId
                ? 'Panel: ' + formatChannelMention(guild, config.ticketPanelChannelId)
                : '⚪ Panel not configured', inline: true },
            { name: '🧭 Explore Beacon', value: 'Use **Explore your Control Center** for guided views of Security, Community, Tickets and the Development Team. Use **Choose a feature** to actually configure settings.', inline: false },
            { name: '🔍 Diagnostics', value: '**/diagnose** checks configuration and permissions. **/roleaudit** reviews risky server roles.', inline: false },
            { name: '💜 From Our Team', value: 'Thanks for choosing Beacon for your community. — **' + BEACON_TEAM_NAME + '**', inline: false },
        ],
        footer: 'Beacon • Main Control Center • Private session ends after 10 minutes',
    });
}

export function buildSettingsSelect(guildId, search = '') {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Choose a feature to configure...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server Prefix')
                    .setDescription('Change the text command prefix')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Moderator Role')
                    .setDescription('Role used for moderation commands')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Command Access')
                    .setDescription('Enable or disable commands and command categories')
                    .setValue('commandAccess')
                    .setEmoji('🛠️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Logging')
                    .setDescription('Configure log channels, event categories, and filters')
                    .setValue('logging')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Welcome & Goodbye')
                    .setDescription('Configure welcome and goodbye messages')
                    .setValue('welcome')
                    .setEmoji('👋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Ticket System')
                    .setDescription('Configure tickets, staff, categories, logs, transcripts and limits')
                    .setValue('ticketSystem')
                    .setEmoji('🎫'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Join to Create')
                    .setDescription('Configure temporary voice channel creation')
                    .setValue('joinToCreate')
                    .setEmoji('🔊'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Reaction Roles')
                    .setDescription('Create and manage reaction role panels')
                    .setValue('reactionRoles')
                    .setEmoji('🎭'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('AutoMod')
                    .setDescription('Basic spam, duplicate-message and mention protection')
                    .setValue('autoModEnabled')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server Progression')
                    .setDescription('Enable daily quests, server XP and the global leaderboard')
                    .setValue('serverProgressionEnabled')
                    .setEmoji('📈'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Update Announcements')
                    .setDescription('Choose where bot updates are announced, or disable them')
                    .setValue('updatesChannelId')
                    .setEmoji('📢'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Log Channel')
                    .setDescription('Channel for system log messages')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
    const query = String(search || '').toLowerCase().trim();
    if (query) {
        const dropdown = row.components[0];
        const matches = dropdown.options.filter(option => {
            const json = option.toJSON();
            return [json.label, json.description, json.value].some(x => x?.toLowerCase().includes(query));
        });
        if (matches.length) dropdown.setOptions(matches);
        else dropdown.setOptions(new StringSelectMenuOptionBuilder()
          .setLabel('No settings found — show all')
          .setValue('dashboardSearchReset').setDescription('Clear the search and reopen the full dashboard'));
        dropdown.setPlaceholder('🔎 Filtered settings: ' + query.slice(0,60));
    }
    return row;
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'Review Setup' : 'Start Setup')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dashboard_refresh:' + guildId)
            .setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dashboard_guide:' + guildId)
            .setLabel('Guide').setEmoji('❔').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dashboard_pin:' + guildId)
            .setLabel('Favourites').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dashboard_undo:' + guildId)
            .setLabel('Undo').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    );
}

function buildFavouriteShortcuts(guildId, ids = []) {
    const found = DASHBOARD_FAVOURITES.filter(feature => ids.includes(feature.id));
    if (!found.length) return null;
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('dashboard_fave_jump:' + guildId)
            .setPlaceholder('⭐ Jump to a favourite setting...')
            .addOptions(found.map(item =>
                new StringSelectMenuOptionBuilder().setLabel(item.label)
                    .setValue(item.id).setDescription('Open this saved dashboard shortcut'))),
    );
}

export function buildDashboardRows(config,guildId,ids=[]){
    const rows=[buildButtonRow(config,guildId),buildSettingsSelect(guildId),buildDashboardHubMenu(guildId)];
    const favourites=buildFavouriteShortcuts(guildId,ids);
    if(favourites)rows.push(favourites);
    return rows;
}
function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,20})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,20})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,20})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `Setup Question ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'You did not answer in time. Run the setup wizard again when ready.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('Setup Cancelled', 'Setup wizard stopped. Your saved answers are still applied.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `Server prefix saved as \`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'Log channel cleared.';
        }
        const channel = guild.channels.cache.get(value);
        return `Log channel saved as ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'Moderator role cleared.';
        }
        const role = guild.roles.cache.get(value);
        return `Moderator role saved as ${role ?? `<@&${value}>`}.`;
    }

    return 'Setting saved.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('That channel was not found in this server or is not a text channel.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('That role was not found in this server.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const ids=await getDashboardFavourites(rootInteraction.client,guild.id,rootInteraction.user.id);
    if(ids.length)embed.addFields({name:'⭐ Your Favourites',value:formatDashboardFavourites(ids).join(' • '),inline:false});
    const components = buildDashboardRows(config,guild.id,ids);
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('Setup Already Running', 'You already have a setup wizard open in your DMs. Reply there to continue, or type `cancel` to stop it.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('Failed to create DM channel for setup wizard', { userId: user.id, error: error.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'Keeping the current server prefix.',
            question: 'What command prefix should this server use?\nCurrent: `' + (config.prefix || getCommandPrefix()) + '`\nReply `skip` to keep it, or `cancel` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('Prefix must be 1-10 characters with no spaces.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'Keeping the current log channel.',
            question: 'Which channel should receive bot logs?\nSend a channel mention, channel ID, `none` to clear, `skip` to keep the current value, or `cancel` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Provide a valid channel mention or ID from this server.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'Keeping the current moderator role.',
            question: 'What role should moderators have?\nSend a role mention, role ID, `none` to clear, `skip` to keep the current value, or `cancel` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Provide a valid role mention or ID from this server.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 Setup Wizard',
                    description: 'Answer each question in this DM.\n\n• Type `skip` to keep the current value\n• Type `cancel` to stop the wizard',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('Failed to send setup wizard DM', { userId: user.id, error: error.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('Skipped', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('Saved', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Failed to refresh dashboard during setup wizard', { error: refreshError.message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${error.message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${error.message}\n\nPlease reply again with a valid answer, \`skip\`, or \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                errors.push(`• setupWizardCompleted: ${error.message}`);
                logger.error('Failed to persist setupWizardCompleted flag', { guildId: guild.id, error: error.message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'Setup Stopped' : 'Setup Cancelled')
            : (errors.length > 0 ? 'Setup Complete' : 'Setup Complete');

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `Setup stopped early. Saved **${Object.keys(changes).length}** setting(s) before stopping.`
                : 'Setup wizard stopped before any changes were saved.')
            : (Object.keys(changes).length > 0
                ? `Updated **${Object.keys(changes).length}** setting(s).${errors.length > 0 ? ' Some answers needed retries.' : ''}`
                : 'No changes were applied.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody + (!wizardCancelled
                ? '\n\n💜 Thank you for setting up Beacon. We appreciate you trusting us with your community. — ' + BEACON_TEAM_NAME
                : ''),
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'Issues', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Failed to refresh dashboard after wizard completion', { error: error.message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `dashboard_modal:${setting}:${guildId}`;

    if (setting === 'serverProgressionEnabled') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📈 Server Progression');
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Enable Server Progression? (on/off)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('on')
            .setRequired(true)
            .setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'autoModEnabled') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ AutoMod');
        const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Enable AutoMod? (on/off)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('on')
            .setRequired(true)
            .setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'updatesChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📢 Update Announcements');

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
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Update Log Channel');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Select a text channel...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Log Channel')
            .setDescription('Channel where system log messages will be sent')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Update Moderator Role');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('Select a moderator role...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('Moderator Role')
            .setDescription('Role used for moderation commands')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Update Server Prefix');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('New prefix (1-10 characters, no spaces)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'serverProgressionEnabled') {
        const value = submitted.fields.getTextInputValue('value')?.trim().toLowerCase();
        if (!['on', 'off'].includes(value)) throw new Error('Reply with `on` or `off`.');
        return value === 'on';
    }

    if (setting === 'autoModEnabled') {
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
        if (!channelId) {
            throw new Error('Please select a log channel.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('Please select a moderator role.');
        }
        return roleId;
    }

    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Error('Prefix must be 1-10 characters with no spaces.');
    }
    return prefix;
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'serverProgressionEnabled') {
        return `Server Progression is now **${value ? 'enabled' : 'disabled'}**. Daily quests and server XP are ${value ? 'active' : 'paused'}.`;
    }

    if (setting === 'autoModEnabled') {
        return `Basic AutoMod is now **${value ? 'enabled' : 'disabled'}**.`;
    }

    if (setting === 'updatesChannelId') {
        if (value === null) return 'Update announcements are now **disabled** for this server.';
        const channel = guild.channels.cache.get(value);
        return `Bot update announcements will now be posted in ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `Log channel set to ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `Moderator role set to ${role ?? `<@&${value}>`}.`;
    }

    return `Server prefix set to \`${value}\`.`;
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `dashboard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        if (setting === 'serverProgressionEnabled' && submitted.guild?.ownerId !== submitted.user.id) {
            throw new Error('Only the server owner can enable or disable Server Progression.');
        }

        let value = resolveSettingModalValue(setting, submitted);
        if (setting === 'updatesChannelId' && value !== null) {
            value = await validateGuildChannelId(submitted.guild, value);
        }
        const configKey = setting === 'serverProgressionEnabled'
            ? 'serverProgression'
            : setting === 'updatesChannelId'
                ? 'updates'
                : setting;
        const configValue = setting === 'serverProgressionEnabled'
            ? { enabled: value }
            : setting === 'updatesChannelId'
                ? { channelId: value }
                : value;
        await updateDashboardSettingWithUndo(client, guildId, configKey, configValue, submitted.user.id);

        await submitted.reply({
            embeds: [successEmbed('Configuration Updated', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Dashboard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'Please try again.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Open Beacon’s main Control Center for server settings, security and support')
        .addStringOption(o => o.setName('find').setDescription('Search for a dashboard setting or feature').setMaxLength(80))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'You need the **Manage Server** permission to use this command.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const search = interaction.options?.getString?.('find') || '';
            const savedFavourites=await getDashboardFavourites(interaction.client,interaction.guildId,interaction.user.id);
            const components = buildDashboardRows(guildConfig,interaction.guildId,savedFavourites);
            if(search)components[1]=buildSettingsSelect(interaction.guildId,search);
            if(savedFavourites.length)embed.addFields({name:'⭐ Your Favourites',
                value:formatDashboardFavourites(savedFavourites).join(' • '),inline:false});
            if (search) embed.addFields({ name: '🔎 Settings Search', value:
              'Showing dashboard settings matching **' + search.replace(/@/g, '@\\u200b').slice(0,75) +
              '**. Use **Refresh** for the complete menu.', inline: false });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('end', async (_collected, reason) => {
                if (reason !== 'time') return;
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('⌛ Dashboard Session Ended',
                        'This control panel expired after 10 minutes. Run **/dashboard** to open a fresh session. No saved settings were changed.')],
                    components: [],
                }).catch(() => {});
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();

                        if (componentInteraction.customId === 'dashboard_refresh:' + interaction.guildId) {
                            const currentConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await refreshDashboard(interaction, currentConfig, interaction.guild);
                            return;
                        }
                        if (componentInteraction.customId === 'dashboard_guide:' + interaction.guildId) {
                            await componentInteraction.followUp({
                                embeds: [infoEmbed('🧭 Beacon Dashboard Guide', [
                                    '**Explore:** Use the second dropdown to view Security, Community, Tickets and a message from our team.',
                                    '**Configure:** Use the settings dropdown to open and edit a feature.',
                                    '**Setup:** Start or review the guided configuration wizard.',
                                    '**Favourites:** Pin up to four features for quick access.',
                                    '**Undo:** Reverse the last supported setting change after confirmation.',
                                    '**Health:** /diagnose checks permissions; /roleaudit reviews powerful roles.',
                                    '',
                                    'This is your main Beacon Control Center. Browsing sections never changes settings.',
                                ].join('\\n'))],
                                flags: MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        if (componentInteraction.customId === 'dashboard_pin:' + interaction.guildId) {
                            const chosen=await getDashboardFavourites(interaction.client,interaction.guildId,componentInteraction.user.id);
                            const choices=new StringSelectMenuBuilder()
                                .setCustomId('dashboard_fave_pin:' + interaction.guildId)
                                .setPlaceholder('⭐ Pin or unpin a feature (up to four)')
                                .addOptions(DASHBOARD_FAVOURITES.map(item=>new StringSelectMenuOptionBuilder()
                                    .setLabel((chosen.includes(item.id)?'✅ ':'')+item.label)
                                    .setDescription(chosen.includes(item.id)?'Remove from favourites':'Pin this feature')
                                    .setValue(item.id)));
                            await componentInteraction.followUp({
                                content:'⭐ **Dashboard Favourites** — Choose a feature to pin or unpin. Your choices persist after restarts. Press **Refresh** on the dashboard to see them.',
                                components:[new ActionRowBuilder().addComponents(choices)],
                                flags:MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        if (componentInteraction.customId === 'dashboard_undo:' + interaction.guildId) {
                            const undo=await getDashboardUndo(interaction.client,interaction.guildId);
                            if(!undo){
                                await componentInteraction.followUp({content:'↩️ No saved dashboard change is available to undo.',flags:MessageFlags.Ephemeral});
                                return;
                            }
                            await componentInteraction.followUp({
                                embeds:[warningEmbed('↩️ Confirm Dashboard Undo',
                                    'Restore the previous saved value for **'+undo.key+'**?\n\n'+
                                    'Beacon will check permissions and refuse if newer changes exist. This only affects one setting.')],
                                components:[new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('dashboard_undo_confirm:'+interaction.guildId)
                                        .setLabel('Confirm Undo').setStyle(ButtonStyle.Danger),
                                    new ButtonBuilder().setCustomId('dashboard_undo_cancel:'+interaction.guildId)
                                        .setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                                )],
                                flags:MessageFlags.Ephemeral,
                            });
                            return;
                        }
                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        // Hub pages are read-only previews, not another command
                        // system. Keep the dashboard intact and let owners return.
                        if (componentInteraction.customId === 'dashboard_hub:' + interaction.guildId) {
                            await componentInteraction.deferUpdate();
                            if (selected === 'hubOverview') {
                                const refreshed = await getGuildConfig(interaction.client, interaction.guildId);
                                await refreshDashboard(interaction, refreshed, interaction.guild);
                            } else {
                                const current = await getGuildConfig(interaction.client, interaction.guildId);
                                const view = buildDashboardHubPanel(selected, current, interaction.guild);
                                if (view) await componentInteraction.followUp({
                                    ...view, flags: MessageFlags.Ephemeral,
                                });
                            }
                            return;
                        }
                        if (selected === 'dashboardSearchReset') {
                            await componentInteraction.deferUpdate();
                            const refreshed = await getGuildConfig(interaction.client, interaction.guildId);
                            await refreshDashboard(interaction, refreshed, interaction.guild);
                            return;
                        }

                        if (selected === 'serverProgressionEnabled' && interaction.guild.ownerId !== componentInteraction.user.id) {
                            await replyUserError(componentInteraction, {
                                type: ErrorTypes.PERMISSION,
                                message: 'Only the **server owner** can enable or disable Server Progression.',
                            });
                            return;
                        }

                        if (selected === 'commandAccess') {
                            // Acknowledge the menu immediately before any database/API work.
                            await componentInteraction.deferUpdate();
                            componentCollector.stop('command_access');
                            await commandsDashboard.execute(
                                interaction,
                                await getGuildConfig(interaction.client, interaction.guildId),
                                interaction.client,
                            );
                            return;
                        }

                        if (selected === 'logging') {
                            // Acknowledge the menu immediately before any database/API work.
                            await componentInteraction.deferUpdate();
                            componentCollector.stop('logging');
                            await loggingDashboard.execute(
                                interaction,
                                await getGuildConfig(interaction.client, interaction.guildId),
                                interaction.client,
                            );
                            return;
                        }

                        if (selected === 'welcome') {
                            // Acknowledge the menu immediately before any database/API work.
                            await componentInteraction.deferUpdate();
                            componentCollector.stop('welcome');
                            await greetDashboard.execute(
                                interaction,
                                await getGuildConfig(interaction.client, interaction.guildId),
                                interaction.client,
                            );
                            return;
                        }

                        if (selected === 'ticketSystem') {
                            // Acknowledge the menu immediately before any database/API work.
                            await componentInteraction.deferUpdate();
                            componentCollector.stop('ticket_system');
                            await ticketDashboard.execute(
                                interaction,
                                await getGuildConfig(interaction.client, interaction.guildId),
                                interaction.client,
                            );
                            return;
                        }

                        if (selected === 'joinToCreate' || selected === 'reactionRoles') {
                            await componentInteraction.deferUpdate();
                            componentCollector.stop(selected);
                            await openDashboardFeature(selected, interaction);
                            return;
                        }

                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Dashboard interaction error:', error);
                    const message = error?.userMessage || 'Failed to process this setting. Please try again.';
                    // Keep the original control panel and its settings intact.
                    // Acknowledged menus cannot receive another initial reply, so
                    // show a private follow-up rather than wiping the dashboard.
                    if (componentInteraction.deferred || componentInteraction.replied) {
                        await componentInteraction.followUp({
                            embeds: [warningEmbed('Dashboard Could Not Open', message)],
                            flags: MessageFlags.Ephemeral,
                        }).catch(() => {});
                    } else {
                        await replyUserError(componentInteraction, {
                            type: ErrorTypes.CONFIGURATION,
                            message,
                        }).catch(() => {});
                    }
                }
            });
        } catch (error) {
            logger.error('Dashboard command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Failed to open the Dashboard. Please try again.',
            });
        }
    },
};
