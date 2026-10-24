import { Events } from "discord.js";
import { registerFoundingServers } from '../services/serverProgressionService.js';
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { loadLockdownStates } from "../services/lockdownService.js";
import { loadAllPersistedAntiNukeConfigs } from "../services/antinukeService.js";
import { clearGuildScopedCommands } from "../handlers/loaders/commandLoader.js";
import { startTicketSlaMonitor } from '../services/ticketSlaService.js';

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

      try {
        const founders=await registerFoundingServers(client);
        startupLog(`Founding communities registered: ${founders.length}/25`);
      } catch(error) { logger.error('Founding registry persistence failed',error); }
      await loadLockdownStates(client);
      await loadAllPersistedAntiNukeConfigs(client);
      startTicketSlaMonitor(client);
      // Keep commands global-only and remove old guild-scoped copies that caused duplicates.
      await clearGuildScopedCommands(client);


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