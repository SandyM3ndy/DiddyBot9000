import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import { Collection, ActionRowBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Beacon • Your community's all-in-one Discord assistant";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
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
    const name = String(commandData?.name || "").toLowerCase();

    if (["broadcast", "popularity", "announcement", "giveexp", "removeleaderboard", "restoreleaderboard"].includes(name)) return "Bot Owner only";
    if (name === "claim" || name === "priority") return "Manage Server or Ticket Staff";
    if (name === "close") return "Manage Server, Ticket Staff, or ticket creator";

    const permissions = commandData?.default_member_permissions;
    if (permissions === "0" || permissions === 0 || permissions === 0n) return "Server administrators";
    if (permissions == null) return "Everyone";

    try {
        const value = BigInt(permissions);
        const flags = [
            [3n, "Administrator"],
            [5n, "Manage Server"],
            [4n, "Manage Channels"],
            [13n, "Manage Messages"],
            [1n, "Kick Members"],
            [2n, "Ban Members"],
            [28n, "Manage Roles"],
            [40n, "Moderate Members"],
            [7n, "View Audit Log"],
        ];
        const names = [];
        for (const [bitIndex, label] of flags) {
            const bit = 1n << bitIndex;
            if ((value & bit) === bit && !names.includes(label)) names.push(label);
        }
        return names.length ? names.join(" or ") : "Restricted";
    } catch {
        return "Restricted";
    }
}

function formatHelpEntry(cmd, registeredCommands) {
    const registeredCmd = registeredCommands.get(cmd.baseName);
    const mention = registeredCmd?.id
        ? `</${cmd.displayName}:${registeredCmd.id}>`
        : `/${cmd.displayName}`;

    return `**${mention}** — ${cmd.description}\n> 👤 **Who can use it:** ${getCommandAccess(cmd.commandData)}`;
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

async function createCategoryCommandsMenu(category, client) {
    const categoryName = formatCategoryName(category);
    const icon = CATEGORY_ICONS[categoryName] || "🔍";

    const categoryCommands = [];

    // Use the actual loaded registry, not every JavaScript file on disk.
    for (const command of client?.commands?.values() || []) {
        const commandData = normalizeCommandData(command);
        if (!commandData?.name || command.category !== category) continue;
        if (commandData.name === 'help' || commandData.name === 'commandlist') continue;
        categoryCommands.push(...buildHelpEntries(command, categoryName));
    }

    categoryCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const registeredCommands = await getRegisteredCommands(client);

    const embed = createEmbed({
        title: `${icon} ${categoryName} Commands`,
        description: categoryCommands.length > 0
            ? `Every command below includes its purpose and who can use it.`
            : `No commands found in the **${categoryName}** category.`
    });

    if (categoryCommands.length > 0) {
        const commandMentions = categoryCommands
            .map((cmd) => {
                const registeredCmd = registeredCommands.get(cmd.baseName);
                if (registeredCmd && registeredCmd.id) {
                    return formatHelpEntry(cmd, registeredCommands);
                }
                return formatHelpEntry(cmd, registeredCommands);
            })
            .join("\n");

        const maxLength = 900;
        if (commandMentions.length <= maxLength) {
            embed.addFields({
                name: "Commands",
                value: commandMentions,
                inline: false,
            });
        } else {
            const chunks = [];
            let currentChunk = "";
            const lines = commandMentions.split("\n");

            for (const line of lines) {
                if ((currentChunk + "\n" + line).length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? "\n" : "") + line;
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: `Commands (Part ${index + 1})`,
                    value: chunk,
                    inline: false,
                });
            });
        }
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);

    return {
        embeds: [embed],
        components: [buttonRow],
    };
}

export async function createAllCommandsMenu(page = 1, client) {
    const commandsPerPage = 15;
    const allCommands = [];

    for (const command of client?.commands?.values() || []) {
        const commandData = normalizeCommandData(command);
        if (!commandData?.name || commandData.name === 'help' || commandData.name === 'commandlist') continue;
        const categoryName = formatCategoryName(command.category || 'Other');
        allCommands.push(...buildHelpEntries(command, categoryName));
    }

    allCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const registeredCommands = await getRegisteredCommands(client);

    const totalPages = Math.ceil(allCommands.length / commandsPerPage);
    const startIndex = (page - 1) * commandsPerPage;
    const endIndex = startIndex + commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, endIndex);

    const embed = createEmbed({
        title: "📋 All Commands",
        description: `Simple command list: what each command does and who can use it. Use the buttons to browse pages.`
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageCommands.length > 0) {
        const commandMentions = pageCommands.map((cmd) => {
            const registeredCmd = registeredCommands.get(cmd.baseName);
            if (registeredCmd && registeredCmd.id) {
                return formatHelpEntry(cmd, registeredCommands);
            }
            return formatHelpEntry(cmd, registeredCommands);
        });

        const columnCount = pageCommands.length > 20 ? 3 : (pageCommands.length > 10 ? 2 : 1);
        const chunkSize = Math.ceil(commandMentions.length / columnCount);

        for (let i = 0; i < columnCount; i++) {
            const chunk = commandMentions
                .slice(i * chunkSize, (i + 1) * chunkSize)
                .join("\n");

            if (!chunk) continue;

            embed.addFields({
                name: i === 0 ? `Commands (Page ${page})` : "Commands (cont.)",
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    const components = [];

    if (totalPages > 1) {
        const paginationRow = getPaginationRow(
            PAGINATION_PREFIX,
            page,
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
        currentPage: page,
        totalPages,
    };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_COMMANDS_ID) {
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