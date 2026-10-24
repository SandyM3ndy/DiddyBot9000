import { logger } from '../logger.js';
import { db, getFromDb } from './wrapper.js';
import { getTicketCounterKey, getTicketKey } from './keys.js';

export { getTicketKey, getTicketCounterKey } from './keys.js';

export async function getTicketData(guildId, channelId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    return await db.get(key);
}

export async function getOpenTicketCountForUser(guildId, userId) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
            const { pgConfig } = await import('../../config/database/postgres.js');
            const result = await db.db.pool.query(
                `SELECT COUNT(*)::int AS count FROM ${pgConfig.tables.tickets}
                 WHERE guild_id = $1
                   AND data->>'userId' = $2
                   AND data->>'status' = 'open'`,
                [guildId, userId],
            );

            return Number(result.rows?.[0]?.count || 0);
        }

        if (typeof db.list === 'function') {
            const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
            let count = 0;

            for (const key of ticketKeys) {
                if (key.endsWith(':counter')) continue;
                const ticket = await getFromDb(key, null);
                if (ticket && ticket.userId === userId && ticket.status === 'open') {
                    count += 1;
                }
            }

            return count;
        }

        throw new Error('Ticket storage does not support counting open requests.');
    } catch (error) {
        logger.error(`Error counting open tickets for user ${userId} in guild ${guildId}:`, error);
        throw new Error('Could not verify your existing tickets; please try again when support storage is available.', { cause: error });
    }
}

export async function saveTicketData(guildId, channelId, data) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    await db.set(key, data);
}

export async function deleteTicketData(guildId, channelId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, channelId);
    await db.delete(key);
}

export async function getTicketCounter(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const counter = await db.get(key);
    return counter || 0;
}

export async function incrementTicketCounter(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const currentCounter = await getTicketCounter(guildId);
    const nextCounter = currentCounter + 1;

    await db.set(key, nextCounter);

    return nextCounter.toString().padStart(3, '0');
}

async function listGuildTickets(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
        const { pgConfig } = await import('../../config/database/postgres.js');
        const result = await db.db.pool.query(
            `SELECT data FROM ${pgConfig.tables.tickets} WHERE guild_id = $1`,
            [guildId],
        );
        return result.rows.map((row) => row.data).filter(Boolean);
    }

    if (typeof db.list !== 'function') {
        return [];
    }

    const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
    const tickets = [];

    for (const key of ticketKeys) {
        if (key.endsWith(':counter')) continue;
        const ticket = await getFromDb(key, null);
        if (ticket) tickets.push(ticket);
    }

    return tickets;
}

// Keep aggregation pure so support metrics are testable without Discord/DB mocks.
export async function listTicketsForUser(guildId, userId) {
    const tickets = await listGuildTickets(guildId);
    return tickets.filter(ticket => String(ticket.userId) === String(userId))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function listOpenSupportQueue(guildId) {
    const tickets = await listGuildTickets(guildId);
    return tickets.filter(ticket => ticket.status === 'open')
        .sort((a, b) => {
            const ranks = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
            const aRank = ranks[a.priority] ?? 4, bRank = ranks[b.priority] ?? 4;
            return aRank - bRank || new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });
}

export function summarizeGuildTickets(tickets) {
    let openCount = 0, closedCount = 0, totalCloseMs = 0, closeSamples = 0;
    let claimedCount = 0, unclaimedOpenCount = 0, totalClaimMs = 0, claimSamples = 0;
    let feedbackCount = 0, ratingSum = 0, responseSamples = 0, totalResponseMs = 0;
    let respondedCount = 0, unansweredOpenCount = 0;
    const claimers = new Map();

    for (const ticket of tickets || []) {
        if (ticket.status === 'open') {
            openCount++;
            if (!ticket.claimedBy) unclaimedOpenCount++;
        } else if (ticket.status === 'closed' || ticket.status === 'archived') {
            closedCount++;
            const elapsed = new Date(ticket.closedAt) - new Date(ticket.createdAt);
            if (ticket.createdAt && ticket.closedAt && Number.isFinite(elapsed) && elapsed >= 0) {
                totalCloseMs += elapsed;
                closeSamples++;
            }
        }

        if (ticket.firstResponseAt) {
            respondedCount++;
            const responseMs = new Date(ticket.firstResponseAt) - new Date(ticket.createdAt);
            if (ticket.createdAt && Number.isFinite(responseMs) && responseMs >= 0) {
                totalResponseMs += responseMs;
                responseSamples++;
            }
        } else if (ticket.status === 'open') {
            unansweredOpenCount++;
        }
        if (ticket.claimedBy) {
            claimedCount++;
            claimers.set(ticket.claimedBy, (claimers.get(ticket.claimedBy) || 0) + 1);
            const elapsed = new Date(ticket.claimedAt) - new Date(ticket.createdAt);
            if (ticket.createdAt && ticket.claimedAt && Number.isFinite(elapsed) && elapsed >= 0) {
                totalClaimMs += elapsed;
                claimSamples++;
            }
        }

        const rating = ticket.feedback?.rating;
        if (rating != null && Number.isInteger(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5) {
            feedbackCount++;
            ratingSum += Number(rating);
        }
    }

    return {
        openCount, closedCount, claimedCount, unclaimedOpenCount,
        respondedCount, unansweredOpenCount,
        avgFirstResponseMs: responseSamples ? Math.round(totalResponseMs / responseSamples) : null,
        avgCloseTimeMs: closeSamples ? Math.round(totalCloseMs / closeSamples) : null,
        avgClaimTimeMs: claimSamples ? Math.round(totalClaimMs / claimSamples) : null,
        feedbackCount,
        avgRating: feedbackCount ? Math.round(ratingSum / feedbackCount * 10) / 10 : null,
        topClaimers: [...claimers].sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([userId, tickets]) => ({ userId, tickets })),
    };
}

export async function getGuildTicketStats(guildId, { strict = false } = {}) {
    try {
        return summarizeGuildTickets(await listGuildTickets(guildId));
    } catch (error) {
        logger.error('Error computing guild ticket statistics', { guildId, error: error?.message });
        if (strict) throw error;
        return summarizeGuildTickets([]);
    }
}


export async function getInactiveOpenTickets(guildId, inactivityMs) {
    const tickets = await listGuildTickets(guildId);
    const cutoff = Date.now() - inactivityMs;
    return tickets.filter(ticket =>
        ticket.status === 'open' &&
        ticket.lastActivityAt &&
        new Date(ticket.lastActivityAt).getTime() <= cutoff
    );
}
