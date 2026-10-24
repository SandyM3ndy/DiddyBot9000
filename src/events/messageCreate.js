import { Events } from 'discord.js';
import { createSpamTracker } from '../utils/autoModSpamTracker.js';

const spamTracker = createSpamTracker();
import { logger } from '../utils/logger.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { getTicketData, saveTicketData } from '../utils/database.js';
import { recordMessageActivity } from '../services/serverProgressionService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug('Guild message received', { guildId: message.guild.id, channelId: message.channel.id, userId: message.author.id });

      // Read the guild configuration once per message instead of twice.
      const guildConfig = await getGuildConfig(client, message.guild.id);

      const autoModTriggered = await handleBasicAutoMod(message, guildConfig);
      if (!autoModTriggered) {
        await recordMessageActivity(client, message).catch(() => {});
      }
      if (message.channel?.name?.startsWith('ticket-') || message.channel?.name?.match(/^[^ ]+ ticket-\d+/)) {
        const ticket = await getTicketData(message.guild.id, message.channel.id).catch(() => null);
        if (ticket?.status === 'open') {
          ticket.lastActivityAt = new Date().toISOString();
          await saveTicketData(message.guild.id, message.channel.id, ticket).catch(() => {});
        }
      }

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      await handlePrefixCommand(message, client, guildConfig);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handleBasicAutoMod(message, guildConfig) {
  try {
    if (guildConfig?.autoModEnabled !== true) return false;

    const reason = spamTracker.inspect({
      guildId: message.guild.id,
      userId: message.author.id,
      content: message.content,
      mentionCount: message.mentions.users.size + message.mentions.roles.size,
    });

    if (!reason) return false;

    await message.delete().catch(() => {});
    const warning = await message.channel.send({
      embeds: [createEmbed({
        title: '🛡️ AutoMod',
        description: `<@${message.author.id}>, your message was removed. **Reason:** ${reason}`,
        color: 'warning',
      })],
    }).catch(() => null);

    if (warning) setTimeout(() => warning.delete().catch(() => {}), 5000);
    return true;
  } catch (error) {
    logger.warn('Basic AutoMod check failed:', error.message);
    return false;
  }
}

async function handlePrefixCommand(message, client, guildConfig) {
  try {
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

