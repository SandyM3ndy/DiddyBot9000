import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../../utils/logger.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;
const CATEGORY_ICONS = { Core: "ℹ️", Moderation: "🛡️", Economy: "💰", Music: "🎵", Fun: "🎮", Leveling: "📊", Utility: "🔧", Ticket: "🎫", Welcome: "👋", Giveaway: "🎉", Counter: "🔢", Tools: "🛠️", Search: "🔍", "Reaction Roles": "🎭", Community: "👥", Birthday: "🎂", "Join To Create": "🔌", Verification: "✅" };
function formatCategoryName(rawCategory) { return rawCategory.replace(/_/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (char) => char.toUpperCase()); }

export async function createInitialHelpMenu(client) {
  const commandsPath = path.join(__dirname, "../../commands");
  const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true })).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name).sort();
  const options = [{ label: "📋 All Commands", description: "Browse every available command in a single list", value: ALL_COMMANDS_ID }, ...categoryDirs.map((category) => { const categoryName = formatCategoryName(category); return { label: `${CATEGORY_ICONS[categoryName] || "🔍"} ${categoryName}`, description: `View commands in the ${categoryName} category`, value: category }; })];
  const botName = client?.user?.username || "Beacon";
  const embed = createEmbed({ title: `📖 ${botName} Help`, description: `Your community's all-in-one Discord assistant. Browse commands by category, see what each command does, and check who can use it.\n\n❤️ I love making Beacon and I am always working on making it better.`, color: 'primary', thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }), fields: [{ name: '🚀 Getting Started', value: ['**1. Configure** — Run `/configwizard` to set up the server.', '**2. Manage access** — Use `/commands dashboard` to control commands and categories.', '**3. Explore** — Pick a category below to see what Beacon can do.'].join('\n'), inline: false }, { name: 'ℹ️ How It Works', value: ['• Dashboard commands manage each feature visually', '• Settings are saved per server', '• Slash commands and prefixes both work once enabled'].join('\n'), inline: false }, { name: '\u200B', value: '-# Need help, want to report an issue, or have an idea? Use the support server below.', inline: false }] });
  embed.setFooter({ text: "Beacon • Your community's all-in-one Discord assistant." }).setTimestamp();
  const supportButton = new ButtonBuilder().setLabel("Support Server").setURL("https://discord.gg/76N2EM6v6k").setStyle(ButtonStyle.Link);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(supportButton), createSelectMenu(CATEGORY_SELECT_ID, "Select to view the commands", options)] };
}

export default { slashOnly: true, data: new SlashCommandBuilder().setName("help").setDescription("Displays the Beacon help menu with all available commands"), async execute(interaction, guildConfig, client) { await InteractionHelper.safeDefer(interaction); const { embeds, components } = await createInitialHelpMenu(client); await InteractionHelper.safeEditReply(interaction, { embeds, components }); setTimeout(async () => { try { if (!InteractionHelper.isInteractionValid(interaction)) return; await InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: "Help menu closed", description: "Help menu has been closed, use /help again.", color: "secondary" })], components: [] }); } catch (error) { logger.debug('Help menu close edit failed:', error?.message); } }, HELP_MENU_TIMEOUT_MS); } };
