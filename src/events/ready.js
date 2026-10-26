import { Events } from "discord.js";
import { registerFoundingServers,FOUNDING_CAP } from '../services/serverProgressionService.js';
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { loadLockdownStates } from "../services/lockdownService.js";
import { loadAllPersistedAntiNukeConfigs } from "../services/antinukeService.js";
import { startTicketSlaMonitor } from '../services/ticketSlaService.js';
import { startSandCoinsMaintenance } from '../services/sandCoinsMaintenance.js';
import { settleExpiredTreasuryHeists } from '../services/treasuryService.js';

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
        startupLog(`Founding communities registered: ${founders.length}/${FOUNDING_CAP}`);
      } catch(error) { logger.error('Founding registry persistence failed',error); }
      await loadLockdownStates(client);
      await loadAllPersistedAntiNukeConfigs(client);
      startTicketSlaMonitor(client);
      startSandCoinsMaintenance(client);
      settleExpiredTreasuryHeists(client).then(count=>{
        if(count)startupLog('Recovered '+count+' expired treasury heist(s)');
      }).catch(error=>logger.warn('Treasury Wars startup sweep failed',error));
      const treasurySweep=setInterval(()=>
        settleExpiredTreasuryHeists(client).catch(error=>
          logger.warn('Treasury Wars expiry sweep failed',error)),60_000);
      treasurySweep.unref?.();
      // Global command sync runs once after login, not during the ready event.
      // Never race it with a second guild command cleanup.

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