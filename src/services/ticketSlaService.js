import { getGuildConfig, setConfigValue } from './config/guildConfig.js';
import { listOpenSupportQueue, saveTicketData } from '../utils/database/tickets.js';
import { logger } from '../utils/logger.js';

const pending = new Set();
const DEFAULT_SLA_MINUTES = 60;

export function getTicketSlaMinutes(config = {}) {
  const configured = config.ticketSlaMinutes;
  if (configured === 0) return 0;
  return Number.isInteger(configured) && configured >= 5 && configured <= 1440
    ? configured : DEFAULT_SLA_MINUTES;
}

export function evaluateTicketSla(ticket, config, now = Date.now()) {
  const minutes = getTicketSlaMinutes(config);
  if (!minutes || ticket.status !== 'open' || ticket.firstResponseAt || ticket.slaAlertedAt) {
    return { overdue: false, minutes };
  }
  const startedAt = new Date(ticket.createdAt).getTime();
  const ageMinutes = Number.isFinite(startedAt) ? Math.floor((now - startedAt) / 60_000) : 0;
  return { overdue: ageMinutes >= minutes, ageMinutes, minutes };
}

export async function checkGuildTicketSla(client, guild, now = Date.now()) {
  const config = await getGuildConfig(client, guild.id);
  if (!getTicketSlaMinutes(config) || !config.ticketLogsChannelId) return { overdue: 0, sent: 0 };
  const channel = guild.channels.cache.get(config.ticketLogsChannelId)
    || await guild.channels.fetch(config.ticketLogsChannelId).catch(() => null);
  if (!channel?.isSendable?.()) return { overdue: 0, sent: 0 };

  const tickets = await listOpenSupportQueue(guild.id);
  let overdue = 0, sent = 0;
  for (const ticket of tickets) {
    const state = evaluateTicketSla(ticket, config, now);
    if (!state.overdue) continue;
    overdue++;
    const lock = guild.id + ':' + ticket.id;
    if (pending.has(lock)) continue;
    pending.add(lock);
    try {
      const roleId = config.ticketStaffRoleId;
      const role = roleId && guild.roles.cache.get(roleId);
      const notification = await channel.send({
        content: (role ? '<@&' + roleId + '> ' : '') +
          '⏰ **Support response overdue** — Ticket ' +
          (ticket.ticketNumber ? '#' + ticket.ticketNumber + ' ' : '') +
          '<#' + ticket.id + '> has waited **' + state.ageMinutes +
          ' minutes** without a recorded staff reply. Target: ' + state.minutes + ' minutes.',
        allowedMentions: { roles: role ? [roleId] : [], users: [], parse: [] },
      });
      if (notification) {
        ticket.slaAlertedAt = new Date(now).toISOString();
        await saveTicketData(guild.id, ticket.id, ticket);
        sent++;
      }
    } catch (error) {
      logger.warn('Ticket SLA reminder failed', { guildId: guild.id, channelId: ticket.id, error: error?.message });
    } finally {
      pending.delete(lock);
    }
  }
  return { overdue, sent };
}

let serviceTimer;
export function startTicketSlaMonitor(client) {
  if (serviceTimer) return serviceTimer;
  const tick = async () => {
    for (const guild of client.guilds.cache.values()) {
      await checkGuildTicketSla(client, guild).catch(error =>
        logger.warn('Ticket SLA monitor failed for guild', { guildId: guild.id, error: error?.message }));
    }
  };
  serviceTimer = setInterval(() => { void tick(); }, 5 * 60_000);
  serviceTimer.unref?.();
  void tick();
  return serviceTimer;
}

export async function configureTicketSla(client, guildId, minutes) {
  if (!Number.isInteger(minutes) || (minutes !== 0 && (minutes < 5 || minutes > 1440))) {
    throw new Error('Choose 0 to disable, or 5–1440 minutes.');
  }
  return setConfigValue(client, guildId, 'ticketSlaMinutes', minutes);
}
