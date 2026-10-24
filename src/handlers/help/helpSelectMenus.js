import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import { Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { formatDefaultMemberPermissions } from '../../utils/helpPermissionLabels.js';
import { isOwnerOnlyCommand } from '../../config/commands/commandCategories.js';
import { paginateHelpEntries } from '../../utils/helpPagination.js';

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Beacon • Your community's all-in-one Discord assistant";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    'Bot Owner': '👑',
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
    Config: "⚙️",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}


function getCommandAccess(commandData) {
    const name = String(commandData?.name || '').toLowerCase();

    if (isOwnerOnlyCommand(name)) return 'Bot Owner Only';
    if (name === 'ticketstats' || name === 'ticket stats') return 'Manage Server, Manage Channels or Ticket Staff';
    if (name.startsWith('ticket ')) return name.endsWith('close') ? 'Ticket creator, staff or Manage Channels' : 'Ticket Staff or Manage Channels';
    if (name === 'giveaway' || name.startsWith('giveaway ')) return 'Manage Server';
    if (name.startsWith('warnings ')) return 'Moderate Members';
    if (name === 'claim' || name === 'priority') return 'Manage Server or Ticket Staff';
    if (name === 'close') return 'Manage Server, Ticket Staff, or ticket creator';

    return formatDefaultMemberPermissions(commandData?.default_member_permissions);
}

function formatHelpField(cmd, registeredCommands) {
    const registered = registeredCommands.get(cmd.baseName);
    const mention = registered?.id
        ? '</' + cmd.displayName + ':' + registered.id + '>'
        : '/' + cmd.displayName;
    const access = getCommandAccess({ ...cmd.commandData, name: cmd.displayName });
    const description = String(cmd.description || 'No description')
        .replace(/^Bot Owner Only\s*[•-]\s*/i, '')
        .trim();
    const icon = access === 'Bot Owner Only' ? '👑' : access === 'Everyone' ? '🌐' : '🔒';
    return {
        name: mention.slice(0, 256),
        value: (description + '\n' + icon + ' **Access:** ' + access).slice(0, 1024),
        inline: false,
    };
}

function buildHelpEntries(command, category) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) {
        return [];
    }

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];

    const entries = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                commandData,
                displayName: `${baseName} ${option.name}`,
                description: option.description || baseDescription,
                category,
            });
            continue;
        }

        if (option.type === SUBCOMMAND_GROUP_TYPE) {
            const nestedOptions = option.options || [];
            for (const nested of nestedOptions) {
                if (nested?.type !== SUBCOMMAND_TYPE) continue;

                entries.push({
                    baseName,
                    commandData,
                    displayName: `${baseName} ${option.name} ${nested.name}`,
                    description: nested.description || option.description || baseDescription,
                    category,
                });
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName,
            commandData,
            displayName: baseName,
            description: baseDescription,
            category,
        });
    }

    return entries;
}

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) {
        return null;
    }

    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) {
        return null;
    }

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option) =>
                  typeof option?.toJSON === 'function' ? option.toJSON() : option,
              )
            : [],
    };
}


const COMMAND_REGISTRY_CACHE_MS = 60_000;

// Cache registered command mentions to avoid an API request on every help menu page.
async function getRegisteredCommands(client) {
    const cached = client?._beaconHelpCommandCache;
    if (cached && cached.expiresAt > Date.now()) return cached.commands;

    const registered = new Collection();
    try {
        if (client?.application?.commands?.fetch) {
            const commands = await client.application.commands.fetch();
            for (const command of commands.values()) {
                registered.set(command.name, command);
            }
        }
    } catch (error) {
        logger.warn('Could not fetch registered commands for help mentions:', error);
    }
    if (client) {
        client._beaconHelpCommandCache = {
            commands: registered,
            expiresAt: Date.now() + COMMAND_REGISTRY_CACHE_MS,
        };
    }
    return registered;
}

export async function createCategoryCommandsMenu(category, client, page = 1) {
    const categoryName = formatCategoryName(category);
    const icon = CATEGORY_ICONS[categoryName] || "🔍";

    const categoryCommands = [];

    // Use the actual loaded registry, not every JavaScript file on disk.
    for (const command of client?.commands?.values() || []) {
        const commandData = normalizeCommandData(command);
        if (!commandData?.name || command.legacyOnly || command.category !== category) continue;
        if (commandData.name === 'help' || commandData.name === 'commandlist') continue;
        categoryCommands.push(...buildHelpEntries(command, categoryName));
    }

    categoryCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const registeredCommands = await getRegisteredCommands(client);

    const categoryPage = paginateHelpEntries(categoryCommands, page, 6);
    const embed = createEmbed({
        title: icon + ' ' + categoryName + ' • Commands',
        description: categoryCommands.length
            ? '**' + categoryCommands.length + ' tools** in this category • Page **' +
              categoryPage.page + ' / ' + categoryPage.totalPages + '**\nChoose a command to see its purpose and access level.'
            : 'No commands are available in this category.',
        color: 'primary',
        footer: 'Beacon • Command Center • ' + categoryName,
    });
    if (categoryPage.items.length) {
        embed.addFields(categoryPage.items.map(cmd => formatHelpField(cmd, registeredCommands)));
    }

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const components = [];
    if (categoryPage.totalPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
            createButton(`help-cat-prev:${category}:${categoryPage.page}`, '◀ Previous', 'secondary', null, categoryPage.page <= 1),
            createButton(`help-cat-next:${category}:${categoryPage.page}`, 'Next ▶', 'secondary', null, categoryPage.page >= categoryPage.totalPages),
        ));
    }
    components.push(new ActionRowBuilder().addComponents(backButton));
    return { embeds: [embed], components, currentPage: categoryPage.page, totalPages: categoryPage.totalPages };
}

export async function createAllCommandsMenu(page = 1, client) {
    const allCommands = [];

    for (const command of client?.commands?.values() || []) {
        const commandData = normalizeCommandData(command);
        if (!commandData?.name || command.legacyOnly || commandData.name === 'help' || commandData.name === 'commandlist') continue;
        const categoryName = formatCategoryName(command.category || 'Other');
        allCommands.push(...buildHelpEntries(command, categoryName));
    }

    allCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const registeredCommands = await getRegisteredCommands(client);

    const { page: currentPage, totalPages, items: pageCommands } = paginateHelpEntries(allCommands, page, 7);
    const embed = createEmbed({
        title: '📚 Beacon • All Commands',
        description: '**' + allCommands.length + ' actions** • Page **' +
          currentPage + ' / ' + totalPages + '**\nEach command shows its purpose and access requirements.',
        color: 'primary',
        footer: 'Beacon • Command Center • All Commands',
    });
    if (pageCommands.length) {
        embed.addFields(pageCommands.map(cmd => formatHelpField(cmd, registeredCommands)));
    }

    const components = [];

    if (totalPages > 1) {
        const paginationRow = getPaginationRow(
            PAGINATION_PREFIX,
            currentPage,
            totalPages,
        );
        components.push(paginationRow);
    }

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);
    components.push(buttonRow);

    return {
        embeds: [embed],
        components,
        currentPage,
        totalPages,
    };
}


/**
 * Guided entry point: give people workflows, not a giant alphabetical list.
 * No saved configuration is changed by browsing this page.
 */
export function createHelpQuickStartMenu() {
    const embed = createEmbed({
        title: '🚀 Beacon • Start Here',
        description: "**Your community's all-in-one Discord assistant.**\n"
            + 'New to Beacon? Pick the path that matches what you want to do.',
        color: 'primary',
        fields: [
            {
                name: '👑 Server owner • Set up Beacon',
                value: '**1. /dashboard** — Configure your server in one control center.\n'
                    + '**2. /diagnose** — Check permissions, roles and missing channels.\n'
                    + '**3. /progression overview** — Optionally enable XP, quests and world rankings.\n'
                    + '**4. /ticket dashboard** — Set up your support panel and staff workflow.',
                inline: false,
            },
            {
                name: '🛡️ Moderator • Manage safely',
                value: '**/cases** — Review moderation history and follow up incidents.\n'
                    + '**/ticket** — Handle support requests and assignments.\n'
                    + '**/roleaudit** — Inspect risky role permissions (if authorised).\n'
                    + 'Sensitive actions still require the appropriate server permissions.',
                inline: false,
            },
            {
                name: '👥 Community member • Jump in',
                value: '**/progression quests** — See your server’s daily goals.\n'
                    + '**/progression weekly** — Join weekly community challenges.\n'
                    + '**/rank** — See how the server is doing globally.\n'
                    + '**/suggest** — Share ideas and collect feedback.',
                inline: false,
            },
            {
                name: '🧰 Need help?',
                value: '**/help search:** Search commands by name or purpose.\n'
                    + '**/diagnose:** Find setup issues (server managers).\n'
                    + 'Use the support link below if something still fails.',
                inline: false,
            },
        ],
        footer: 'Beacon • Quick Start • No settings are changed by this guide',
    });
    const buttons = new ActionRowBuilder().addComponents(
        createButton(BACK_BUTTON_ID, 'Back to Command Center', 'primary', '⬅️'),
        new ButtonBuilder().setLabel('Beacon Support').setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/76N2EM6v6k').setEmoji('💬'),
    );
    return { embeds: [embed], components: [buttons] };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const selectedCategory = interaction.values[0];

            if (selectedCategory === 'help-quickstart') {
                const { embeds, components } = createHelpQuickStartMenu();
                await interaction.editReply({ embeds, components });
            } else if (selectedCategory === ALL_COMMANDS_ID) {
                const { embeds, components } = await createAllCommandsMenu(1, client);
                await interaction.editReply({
                    embeds,
                    components,
                });
            } else {
                const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client);
                await interaction.editReply({
                    embeds,
                    components,
                });
            }
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            await handleInteractionError(interaction, error, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'help_category',
            });
        }
    },
};