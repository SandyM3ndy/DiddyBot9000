import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { loadLockdownStates } from "../services/lockdownService.js";
import { loadAllPersistedAntiNukeConfigs } from "../services/antinukeService.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.normalPresence = structuredClone(config.bot.presence);
      client.user.setPresence(client.normalPresence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      await loadLockdownStates(client);
      await loadAllPersistedAntiNukeConfigs(client);
      // Force-sync the complete command set directly to every guild after the
      // Discord client is fully ready. This bypasses global-command propagation
      // delays and guarantees existing servers receive the current commands.
      const guildCommands = Array.from(client.commands.values())
        .filter((command) => command?.data && typeof command.data.toJSON === "function")
        .map((command) => command.data.toJSON());

      for (const guild of client.guilds.cache.values()) {
        try {
          await guild.commands.set(guildCommands);
          startupLog(`Synced ${guildCommands.length} slash commands to ${guild.name}`);
        } catch (error) {
          logger.error(`Failed to sync slash commands to ${guild.name}:`, error);
        }
      }


      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(
        `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(
        `Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
      );

      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(
        `Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};