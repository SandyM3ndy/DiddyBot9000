// ticket.js

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { buildStandardLogEmbed, formatLogLine } from '../utils/logging/logEmbeds.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData, getOpenTicketCountForUser, incrementTicketCounter } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { ensureTypedServiceError, wrapServiceBoundary } from '../utils/serviceErrorBoundary.js';
import { PRIORITY_MAP } from '../utils/helpers.js';
import { buildTicketTranscriptHtml } from '../utils/ticket/ticketTranscriptHtml.js';
const TICKET_DELETE_DELAY_MS = 3000;
const TICKET_DELETE_DELAY_SECONDS = Math.floor(TICKET_DELETE_DELAY_MS / 1000);
const TICKET_SERVICE = 'ticketService';

// Serialize ticket creation per user within one Beacon process. This prevents
// two simultaneous form submits from both passing the max-open-ticket check.
const ticketCreationLocks = new Map();
export async function withTicketCreationLock(guildId, userId, callback) {
  const key = guildId + ':' + userId;
  const previous = ticketCreationLocks.get(key) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  ticketCreationLocks.set(key, next);
  await previous;
  try {
    return await callback();
  } finally {
    if (ticketCreationLocks.get(key) === next) ticketCreationLocks.delete(key);
    release();
  }
}


// A per-channel mutex protects ticket lifecycle transitions from near-simultaneous
// actions in one process. Multi-replica deployments should still use DB-backed locking.
const ticketMutationLocks = new Map();
export async function withTicketMutationLock(guildId, channelId, callback) {
  const key = guildId + ':' + channelId;
  const previous = ticketMutationLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  ticketMutationLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    if (ticketMutationLocks.get(key) === current) ticketMutationLocks.delete(key);
    release();
  }
}

function ticketUserError(message, userMessage, type = ErrorTypes.VALIDATION, context = {}) {
  throw createError(message, type, userMessage, { service: TICKET_SERVICE, ...context });
}

function requireTicket(ticketData, channel) {
  if (!ticketData) {
    ticketUserError(
      'Not a ticket channel',
      'This is not a ticket channel.',
      ErrorTypes.VALIDATION,
      { channelId: channel?.id, guildId: channel?.guild?.id }
    );
  }
  return ticketData;
}

function rethrowTicketError(error, operation, userMessage, context = {}) {
  throw ensureTypedServiceError(error, {
    service: TICKET_SERVICE,
    operation,
    message: `Ticket operation failed: ${operation}`,
    userMessage,
    context,
  });
}



export function buildTicketControlRow({ claimedBy = null } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(claimedBy ? 'ticket_unclaim' : 'ticket_claim')
      .setLabel(claimedBy ? 'Release' : 'Claim')
      .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji(claimedBy ? '🔓' : '🙋'),
    new ButtonBuilder().setCustomId('ticket_info')
      .setLabel('Info').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
    new ButtonBuilder().setCustomId('ticket_transcript')
      .setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
    new ButtonBuilder().setCustomId('ticket_pin')
      .setLabel('Pin').setStyle(ButtonStyle.Secondary).setEmoji('📌'),
    new ButtonBuilder().setCustomId('ticket_close')
      .setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );
}

export function buildPriorityControlRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_priority:low').setLabel('Low')
      .setStyle(ButtonStyle.Secondary).setEmoji('🔵'),
    new ButtonBuilder().setCustomId('ticket_priority:medium').setLabel('Medium')
      .setStyle(ButtonStyle.Secondary).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('ticket_priority:high').setLabel('High')
      .setStyle(ButtonStyle.Secondary).setEmoji('🟠'),
    new ButtonBuilder().setCustomId('ticket_priority:urgent').setLabel('Urgent')
      .setStyle(ButtonStyle.Danger).setEmoji('🔴'),
  );
}


export function buildTicketControlRows({ claimedBy = null, enablePriority = false } = {}) {
  return [buildTicketControlRow({ claimedBy }),
    ...(enablePriority ? [buildPriorityControlRow()] : [])];
}

export const getUserTicketCount = wrapServiceBoundary(async function getUserTicketCount(guildId, userId) {
  return await getOpenTicketCountForUser(guildId, userId);
}, {
  service: TICKET_SERVICE,
  operation: 'getUserTicketCount',
  userMessage: 'Failed to count open tickets.',
  context: {},
});

export async function createTicket(guild, member, categoryId, reason = 'No reason provided', priority = 'none', ticketType = 'support') {
  return withTicketCreationLock(guild.id, member.id, async () => {
  let createdChannel = null;
  let savedRecord = false;
  try {
    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config.tickets || {};
    
    const maxTicketsPerUser = config.maxTicketsPerUser ?? 3;
    const currentTicketCount = await getUserTicketCount(guild.id, member.id);
    
    if (currentTicketCount >= maxTicketsPerUser) {
      ticketUserError(
        `Max open tickets reached for ${member.id}`,
        `You have reached the maximum number of open tickets (${maxTicketsPerUser}). Please close your existing tickets before creating a new one.`,
        ErrorTypes.VALIDATION,
        { guildId: guild.id, userId: member.id, operation: 'createTicket' }
      );
    }
    
    let category = categoryId ?
      guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null) :
      guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name.toLowerCase().includes('tickets')
      );
    
    if (categoryId && category?.type !== ChannelType.GuildCategory) {
      ticketUserError('Invalid ticket category', 'The server ticket category is missing. Ask a manager to repair the ticket dashboard.', ErrorTypes.CONFIGURATION);
    }

    if (!category && !categoryId) {
      category = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    }
    
    const ticketNumber = await getNextTicketNumber(guild.id);
    
    let channelName = `ticket-${ticketNumber}`;
    
    if (priority !== 'none') {
      const priorityInfo = PRIORITY_MAP[priority];
      if (priorityInfo) {
        channelName = `${priorityInfo.emoji} ${channelName}`;
      }
    }
    
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: 'beacon-ticket:' + member.id + ':' + ticketNumber,
      parent: category?.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: guild.client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...(config.ticketStaffRoleId ? [{
          id: config.ticketStaffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        }] : []),
      ],
    });
    
    createdChannel = channel;

    const ticketData = {
      id: channel.id,
      ticketNumber,
      userId: member.id,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
      type: ['support', 'report', 'bug', 'other'].includes(ticketType) ? ticketType : 'other',
      lastActivityAt: new Date().toISOString(),
    };
    
    await saveTicketData(guild.id, channel.id, ticketData);
    savedRecord = true;
    
    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.none;
    
    const embed = createEmbed({
      title: 'Ticket #' + ticketNumber,
      description: [
        '🎫 **Welcome to your private support space.**',
        'Thanks for contacting us, ' + member.toString() + '. Our team will respond when available.',
        '',
        '**Your request**',
        String(reason || 'No summary supplied').slice(0, 1100),
        '',
        'Use **Info** to review status, **Claim** for staff assignment, and **Close** when the conversation is finished.',
      ].join('\n'),
      color: priorityInfo.color,
      fields: [
        { name: 'Status', value: '🟢 Open', inline: true },
        { name: 'Claimed By', value: 'Not claimed', inline: true },
        { name: 'Created', value: '<t:' + Math.floor(Date.now() / 1000) + ':R>', inline: true },
        { name: 'Category', value: ticketData.type[0].toUpperCase() + ticketData.type.slice(1), inline: true },
        { name: 'Priority', value: priorityInfo.emoji + ' ' + priorityInfo.label, inline: true },
      ],
      footer: 'Beacon • Private support ticket • Never share passwords or account tokens',
    });

    const rows = buildTicketControlRows({ enablePriority: Boolean(ticketConfig.enablePriority) });

    const staffMention = config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : '';
    const messageContent = `${member.toString()}${staffMention}`;
    
    const ticketMessage = await channel.send({ 
      content: messageContent,
      embeds: [embed],
      components: rows,
      allowedMentions: { users: [member.id], roles: config.ticketStaffRoleId ? [config.ticketStaffRoleId] : [] },
    });

    await ticketMessage.pin().catch(() => {});
    
    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,
      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber: ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason: reason,
        priority: priority || 'none',
        metadata: {
          channelId: channel.id,
          categoryName: category?.name || 'Default'
        }
      }
    });
    
    return { channel, ticketData };
    
  } catch (error) {
    if (createdChannel) {
      try { await createdChannel.delete('Rollback incomplete ticket creation'); }
      catch (cleanupError) { logger.error('Orphan ticket channel cleanup failed', { channelId: createdChannel.id, error: cleanupError?.message }); }
      if (savedRecord) {
        try { await deleteTicketData(guild.id, createdChannel.id); }
        catch (cleanupError) { logger.error('Orphan ticket record cleanup failed', { channelId: createdChannel.id, error: cleanupError?.message }); }
      }
    }
    rethrowTicketError(error, 'createTicket', 'Failed to create ticket. Please try again in a moment.', { guildId: guild?.id, userId: member?.id });
  }
  });
}
export async function closeTicket(channel, closer, reason = 'No reason provided') {
  return withTicketMutationLock(channel.guild.id, channel.id, async () => {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    if (ticketData.status !== 'open') {
      ticketUserError('Ticket already closed', 'This ticket has already been closed.',
        ErrorTypes.VALIDATION, { channelId: channel.id });
    }
    const config = await getGuildConfig(channel.client, channel.guild.id);
    const dmOnClose = config.dmOnClose !== false;
    const closedCategoryId = config.ticketClosedCategoryId || null;
    let movedToClosedCategory = false;
    let dmSent = false;
    
    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (closedCategoryId && channel.parentId !== closedCategoryId) {
      const closedCategory = channel.guild.channels.cache.get(closedCategoryId)
        || await channel.guild.channels.fetch(closedCategoryId).catch(() => null);

      if (closedCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(closedCategoryId, { lockPermissions: false });
          movedToClosedCategory = true;
        } catch (moveError) {
            logger.warn(`Could not move ticket ${channel.id} to closed category ${closedCategoryId}: ${moveError.message}`);
        }
      } else {
        logger.warn(`Configured closed category is invalid for guild ${channel.guild.id}: ${closedCategoryId}`);
      }
    }
    
    if (dmOnClose) {
      try {
        const ticketCreator = await channel.client.users.fetch(ticketData.userId).catch(() => null);
        if (ticketCreator) {
          const dmEmbed = createEmbed({
            title: '🎫 Your Ticket Has Been Closed',
            description: `Your ticket **${channel.name}** has been closed.\n\n**Reason:** ${reason}\n**Closed by:** ${closer.tag}\n**Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nThank you for using our support system! If you have any further questions, feel free to create a new ticket.`,
            color: '#e74c3c',
            footer: { text: `Ticket ID: ${ticketData.id}` }
          });

          await ticketCreator.send({ embeds: [dmEmbed], allowedMentions: { parse: [] } });
          dmSent = true;

          try {
            const feedbackEmbed = createEmbed({
              title: '⭐ How was your support experience?',
              description: `We'd love to know how we did with **${channel.name}**.\nSelect a rating below — it only takes a second!`,
              color: '#F1C40F',
              footer: { text: 'Your feedback helps us improve.' },
            });

            const base = `ticket_feedback:${channel.guild.id}:${channel.id}`;
            const starsRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`${base}:1`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:2`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:3`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:4`).setLabel('⭐ 4').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:5`).setLabel('⭐ 5').setStyle(ButtonStyle.Primary),
            );
            const declineRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_comment:${channel.guild.id}:${channel.id}`)
                .setLabel('✍️ Add Comment')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_decline:${channel.guild.id}:${channel.id}`)
                .setLabel('❌ No thanks')
                .setStyle(ButtonStyle.Secondary),
            );

            await ticketCreator.send({
              embeds: [feedbackEmbed],
              components: [starsRow, declineRow],
            });
          } catch (feedbackError) {
            logger.warn(`Could not send feedback survey to ticket creator ${ticketData.userId}: ${feedbackError.message}`);
          }
        }
      } catch (dmError) {
          logger.warn(`Could not send DM to ticket creator ${ticketData.userId}: ${dmError.message}`);
      }
    }
    
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      const targetUser = user?.user || await channel.client.users.fetch(ticketData.userId).catch(() => null);
      
      if (targetUser) {
        const overwrite = channel.permissionOverwrites.cache.get(ticketData.userId);
        if (overwrite) {
          await overwrite.edit({
            ViewChannel: false,
            SendMessages: false,
          });
        } else {
          await channel.permissionOverwrites.create(targetUser, {
            ViewChannel: false,
            SendMessages: false,
          });
        }
      }
    } catch (permError) {
        logger.warn(`Could not update user permissions for closed ticket: ${permError.message}`);
    }
    
    try {
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Status');
      
      if (statusField) {
        statusField.value = '🔴 Closed';
      }
      
      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: embed.description || 'Ticket discussion',
        color: '#e74c3c',
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ 
        embeds: [updatedEmbed],
components: []
      });
    }
    
    const closeEmbed = createEmbed({
      title: 'Ticket Closed',
      description: `This ticket has been closed by ${closer}.\n**Reason:** ${reason}${dmSent ? '\n\n📩 The ticket creator was notified.' : ''}`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Reopen Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Delete Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
    
    await channel.send({ embeds: [closeEmbed], components: [controlRow] });
    
    } catch (presentationError) {
      logger.warn('Ticket closed, but channel summary controls could not be updated', { channelId: channel.id, error: presentationError?.message });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason: reason,
        metadata: {
          dmSent,
          closedAt: ticketData.closedAt,
          movedToClosedCategory
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'closeTicket', 'Failed to close ticket. Please try again in a moment.', { guildId: channel?.guild?.id, channelId: channel?.id, closerId: closer?.id });
  }

  });
}

export async function claimTicket(channel, claimer) {
  return withTicketMutationLock(channel.guild.id, channel.id, async () => {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (ticketData.status !== 'open') {
      ticketUserError('Closed ticket cannot be claimed', 'Reopen this ticket before claiming it.', ErrorTypes.VALIDATION);
    }

    if (ticketData.claimedBy) {
      ticketUserError(
        'Ticket already claimed',
        `This ticket is already claimed by <@${ticketData.claimedBy}>`,
        ErrorTypes.VALIDATION,
        { channelId: channel.id, claimedBy: ticketData.claimedBy, operation: 'claimTicket' }
      );
    }
    
    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    try {
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      
      if (claimedField) {
        claimedField.value = claimer.toString();
      }
      
      const config = await getGuildConfig(channel.client, channel.guild.id);
      const rows = buildTicketControlRows({ claimedBy: claimer.id, enablePriority: Boolean(config.tickets?.enablePriority) });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: rows 
      });
    }
    
    const claimEmbed = createEmbed({
      title: 'Ticket Claimed',
      description: `🎉 ${claimer} has claimed this ticket!`,
      color: '#2ecc71'
    });
    
    const unclaimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_unclaim')
        .setLabel('Unclaim')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
    );

    const claimStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      (m.embeds[0].title === 'Ticket Claimed' || m.embeds[0].title === 'Ticket Unclaimed')
    );

    if (claimStatusMessage) {
      await claimStatusMessage.edit({ embeds: [claimEmbed], components: [unclaimRow] });
    } else {
      await channel.send({ embeds: [claimEmbed], components: [unclaimRow] });
    }
    
    } catch (presentationError) {
      logger.warn('Ticket was claimed but the controls could not be refreshed', { channelId: channel.id, error: presentationError?.message });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'claim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,
        metadata: {
          claimedAt: ticketData.claimedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'claimTicket', 'Failed to claim ticket. Please try again in a moment.', { guildId: channel?.guild?.id, channelId: channel?.id, claimerId: claimer?.id });
  }

  });
}

export async function reopenTicket(channel, reopener) {
  return withTicketMutationLock(channel.guild.id, channel.id, async () => {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (ticketData.status !== 'closed') {
      ticketUserError(
        'Ticket not closed',
        'This ticket is not currently closed.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, operation: 'reopenTicket' }
      );
    }

    const config = await getGuildConfig(channel.client, channel.guild.id);
    const openCategoryId = config.ticketCategoryId || null;
    let movedToOpenCategory = false;
    let openCategoryMoveFailed = false;
    
    ticketData.status = 'open';
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    ticketData.closedBy = null;
    ticketData.closedAt = null;
    ticketData.closeReason = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (openCategoryId && channel.parentId !== openCategoryId) {
      const openCategory = channel.guild.channels.cache.get(openCategoryId)
        || await channel.guild.channels.fetch(openCategoryId).catch(() => null);

      if (openCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(openCategoryId, { lockPermissions: false });
          movedToOpenCategory = true;
        } catch (moveError) {
          openCategoryMoveFailed = true;
          logger.warn(`Could not move reopened ticket ${channel.id} to open category ${openCategoryId}: ${moveError.message}`);
        }
      } else {
        openCategoryMoveFailed = true;
        logger.warn(`Configured open ticket category is invalid for guild ${channel.guild.id}: ${openCategoryId}`);
      }
    }
    
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await channel.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
      }
    } catch (error) {
      logger.warn(`Could not restore access for user ${ticketData.userId}:`, error.message);
    }
    
    try {
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Status');
      
      if (statusField) {
        statusField.value = '🟢 Open';
      }
      
      const rows = buildTicketControlRows({ claimedBy: ticketData.claimedBy, enablePriority: Boolean(config.tickets?.enablePriority) });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: rows 
      });
    }
    
    const reopenEmbed = createEmbed({
      title: 'Ticket Reopened',
      description: `🔓 ${reopener} has reopened this ticket!`,
      color: '#2ecc71'
    });

    const closeStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title === 'Ticket Closed' &&
      m.components.length > 0 &&
      m.components[0].components.some(c => c.customId === 'ticket_reopen')
    );

    if (closeStatusMessage) {
      await closeStatusMessage.edit({ embeds: [reopenEmbed], components: [] });
    } else {
      await channel.send({ embeds: [reopenEmbed] });
    }
    
    } catch (presentationError) {
      logger.warn('Ticket reopened, but channel summary controls could not be updated', { channelId: channel.id, error: presentationError?.message });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'reopen',
        ticketId: channel.id,
        ticketNumber: ticketData.ticketNumber || ticketData.id,
        userId: ticketData.userId,
        executorId: reopener.id,
        metadata: { reopenedAt: new Date().toISOString(), movedToOpenCategory },
      },
    });
    return { ticketData, movedToOpenCategory, openCategoryMoveFailed };
    
  } catch (error) {
    rethrowTicketError(error, 'reopenTicket', 'Failed to reopen ticket. Please try again in a moment.', { guildId: channel?.guild?.id, channelId: channel?.id, reopenerId: reopener?.id });
  }

  });
}

const MAX_ARCHIVE_MESSAGES = 3000;
const MAX_ARCHIVE_BYTES = 7_500_000;

/** Make a complete transcript or stop rather than silently archive only part of a ticket. */
export async function generateTicketTranscript(channel) {
  const messages = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    if (messages.length > MAX_ARCHIVE_MESSAGES) {
      ticketUserError('Transcript exceeds archive limit',
        'This ticket is too large for automatic archival. Export it manually before deleting.',
        ErrorTypes.VALIDATION, { channelId: channel.id });
    }
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  const html = buildTicketTranscriptHtml({
    channelName: channel.name,
    guildName: channel.guild.name,
    messages,
  });
  const buffer = Buffer.from(html, 'utf8');
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    ticketUserError('Transcript exceeds upload limit',
      'This ticket archive exceeds the safe upload size. Export it manually before deleting.',
      ErrorTypes.VALIDATION, { channelId: channel.id });
  }
  return { attachment: new AttachmentBuilder(buffer, { name: 'ticket-' + channel.id + '.html' }),
    messageCount: messages.length };
}

export async function deleteTicket(channel, deleter, { onArchived } = {}) {
  return withTicketMutationLock(channel.guild.id, channel.id, async () => {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    if (ticketData.status !== 'closed') {
      ticketUserError('Ticket must be closed first',
        'Close the ticket before permanently deleting it.', ErrorTypes.VALIDATION);
    }

    const config = await getGuildConfig(channel.client, channel.guild.id);
    if (!config.ticketTranscriptChannelId) {
      ticketUserError('Ticket transcript channel is not configured',
        'To protect support conversations, configure a private transcript channel in /dashboard before deleting tickets.',
        ErrorTypes.CONFIGURATION);
    }
    const archiveChannel = channel.guild.channels.cache.get(config.ticketTranscriptChannelId)
      || await channel.guild.channels.fetch(config.ticketTranscriptChannelId).catch(() => null);
    if (!archiveChannel?.isSendable?.() || archiveChannel.guildId !== channel.guild.id || archiveChannel.id === channel.id) {
      ticketUserError('Ticket transcript destination unavailable',
        'The configured transcript channel is missing or unavailable. Repair it in /dashboard, then retry.',
        ErrorTypes.CONFIGURATION);
    }

    // A public log channel must never receive private ticket contents.
    const everyone = channel.guild.roles.everyone;
    const publicAccess = archiveChannel?.permissionsFor?.(everyone)?.has(PermissionFlagsBits.ViewChannel);
    if (publicAccess !== false) {
      ticketUserError('Transcript archive channel is not private',
        'The configured transcript channel is visible to @everyone (or its privacy cannot be verified). Restrict View Channel access before archiving tickets.',
        ErrorTypes.PERMISSION);
    }


    // Do not destroy a support conversation until an archive has been generated
    // and Discord confirms that a copy was uploaded to the configured channel.
    const transcript = await generateTicketTranscript(channel);
    try {
      await archiveChannel.send({
        embeds: [buildStandardLogEmbed({
          color: 0x5865F2,
          title: '📜 Beacon • Archived Support Ticket',
          description: [
            formatLogLine('Ticket', ticketData.id),
            formatLogLine('Requester', '<@' + ticketData.userId + '>'),
            formatLogLine('Closed by', ticketData.closedBy ? '<@' + ticketData.closedBy + '>' : 'Unknown'),
            formatLogLine('Messages', String(transcript.messageCount)),
            formatLogLine('Archived', '<t:' + Math.floor(Date.now()/1000) + ':F>'),
          ].join('\n'),
          timestamp: true,
        })],
        files: [transcript.attachment],
        allowedMentions: { parse: [] },
      });
    } catch (archiveError) {
      logger.error('Ticket archive upload failed: deletion cancelled', { guildId: channel.guild.id,
        channelId: channel.id, error: archiveError?.message });
      ticketUserError('Transcript delivery failed',
        'Beacon could not safely save this transcript. The ticket has NOT been deleted. Check archive-channel permissions and retry.',
        ErrorTypes.CONFIGURATION);
    }

    // A button interaction belongs to this channel. Acknowledge while it still
    // exists: editing/replying after channel.delete() fails with Discord 10008.
    // If the confirmation cannot be delivered, keep the channel intact.
    if (onArchived) {
      await onArchived({
        messageCount: transcript.messageCount,
        archiveChannelId: archiveChannel.id,
      });
    }

    await channel.delete('Ticket transcript saved and channel deleted by ' + deleter.id);
    // Keep only narrow operational metadata so existing feedback links and
    // historical service statistics continue working after a channel is gone.
    // The conversation itself is stored in the configured private transcript channel.
    const archived = {
      id: ticketData.id,
      ticketNumber: ticketData.ticketNumber,
      guildId: ticketData.guildId,
      userId: ticketData.userId,
      status: 'archived',
      priority: ticketData.priority,
      type: ticketData.type,
      createdAt: ticketData.createdAt,
      claimedAt: ticketData.claimedAt,
      claimedBy: ticketData.claimedBy,
      firstResponseAt: ticketData.firstResponseAt,
      firstResponderId: ticketData.firstResponderId,
      closedAt: ticketData.closedAt,
      closedBy: ticketData.closedBy,
      feedback: ticketData.feedback || null,
      archivedAt: new Date().toISOString(),
      archivedBy: deleter.id,
      archivedMessageCount: transcript.messageCount,
    };
    try {
      await saveTicketData(channel.guild.id, channel.id, archived);
    } catch (storageError) {
      // The earlier ticket record should still exist. Do not misreport this
      // as a failed channel deletion after the archive and deletion succeeded.
      logger.error('Archived ticket metadata update failed', {
        guildId: channel.guild.id, channelId: channel.id, error: storageError?.message,
      });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'delete', ticketId: channel.id, ticketNumber: ticketData.ticketNumber || ticketData.id,
        userId: ticketData.userId, executorId: deleter.id,
        metadata: { archivedAt: new Date().toISOString(), messageCount: transcript.messageCount },
      },
    });
    return { ...ticketData, archivedMessageCount: transcript.messageCount };
  } catch (error) {
    rethrowTicketError(error, 'deleteTicket',
      'Could not safely archive and delete the ticket. The channel has been retained if possible.',
      { guildId: channel?.guild?.id, channelId: channel?.id, deleterId: deleter?.id });
  }

  });
}

export async function unclaimTicket(channel, unclaimer) {
  return withTicketMutationLock(channel.guild.id, channel.id, async () => {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (!ticketData.claimedBy) {
      ticketUserError(
        'Ticket not claimed',
        'This ticket is not currently claimed.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, operation: 'unclaimTicket' }
      );
    }
    
    if (ticketData.claimedBy !== unclaimer.id && !unclaimer.permissions.has(PermissionFlagsBits.ManageChannels)) {
      ticketUserError(
        'Cannot unclaim ticket',
        'You can only unclaim your own tickets or need Manage Channels permission.',
        ErrorTypes.PERMISSION,
        { channelId: channel.id, operation: 'unclaimTicket' }
      );
    }
    
    const previousClaimer = ticketData.claimedBy;
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    try {
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      
      if (claimedField) {
        claimedField.value = 'Not claimed';
      }
      
      const config = await getGuildConfig(channel.client, channel.guild.id);
      const rows = buildTicketControlRows({ enablePriority: Boolean(config.tickets?.enablePriority) });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: rows 
      });
    }
    
    const claimMessage = messages.find(m => 
      m.embeds.length > 0 && 
      (m.embeds[0].title === 'Ticket Claimed' || m.embeds[0].title === 'Ticket Unclaimed')
    );
    
    if (claimMessage) {
      const unclaimEmbed = createEmbed({
        title: 'Ticket Unclaimed',
        description: `🔓 ${unclaimer} has unclaimed this ticket!`,
        color: '#f39c12'
      });
      
      await claimMessage.edit({ 
        embeds: [unclaimEmbed],
        components: []
      });
    } else {
      const unclaimEmbed = createEmbed({
        title: 'Ticket Unclaimed',
        description: `🔓 ${unclaimer} has unclaimed this ticket!`,
        color: '#f39c12'
      });
      
      await channel.send({ embeds: [unclaimEmbed] });
    }
    
    } catch (presentationError) {
      logger.warn('Ticket released but controls could not be updated', { channelId: channel.id, error: presentationError?.message });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'unclaim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,
        metadata: {
          previousClaimer: previousClaimer
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'unclaimTicket', 'Failed to unclaim ticket. Please try again in a moment.', { guildId: channel?.guild?.id, channelId: channel?.id, unclaimerId: unclaimer?.id });
  }

  });
}

async function getNextTicketNumber(guildId) {
  return await incrementTicketCounter(guildId);
}

export async function updateTicketPriority(channel, priority, updater) {
  return withTicketMutationLock(channel.guild.id, channel.id, async () => {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const priorityInfo = PRIORITY_MAP[priority];
    if (!priorityInfo) {
      ticketUserError(
      'Invalid priority level',
      'Invalid priority level.',
      ErrorTypes.VALIDATION,
      { channelId: channel.id, priority, operation: 'updateTicketPriority' }
    );
    }
    
    const previousPriority = ticketData.priority || 'none';
    ticketData.priority = priority;
    ticketData.priorityUpdatedBy = updater.id;
    ticketData.priorityUpdatedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const currentName = channel.name;
    const priorityEmojis = [...new Set(Object.values(PRIORITY_MAP).map((item) => item.emoji).filter(Boolean))];
    const escapedPriorityEmojis = priorityEmojis.map((emoji) => emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const cleanName = escapedPriorityEmojis.length > 0
      ? currentName.replace(new RegExp(`(?:${escapedPriorityEmojis.join('|')})`, 'g'), '').trim()
      : currentName.trim();
    const newName = priority === 'none' ? cleanName : `${priorityInfo.emoji} ${cleanName}`;

    if (newName && newName !== currentName) {
      try {
        await channel.setName(newName);
      } catch (nameError) {
        logger.warn(`Could not update channel name for priority: ${nameError.message}`);
      }
    }
    
    // The DB value is already saved. Message-edit outages must not cause
    // false failure reports or roll back the new priority.
    try {
      const messages = await channel.messages.fetch();
      const ticketMessage = messages.find(m =>
        m.embeds.length > 0 && m.embeds[0].title?.startsWith('Ticket #')
      );
      if (ticketMessage) {
        const oldEmbed = ticketMessage.embeds[0];
        const fields = (oldEmbed.fields || []).map(field => ({
          name: field.name,
          value: field.name === 'Priority'
            ? priorityInfo.emoji + ' ' + priorityInfo.label
            : field.value,
          inline: Boolean(field.inline),
        }));
        const updated = createEmbed({
          title: oldEmbed.title || 'Ticket',
          description: oldEmbed.description || 'Private support conversation.',
          color: priorityInfo.color,
          fields,
          footer: oldEmbed.footer || undefined,
        });
        await ticketMessage.edit({ embeds: [updated] });
      }
      await channel.send({
        embeds: [createEmbed({
          title: '🎚️ Ticket Priority Updated',
          description: 'Priority is now **' + priorityInfo.emoji + ' ' + priorityInfo.label +
            '** • Changed by ' + updater.toString(),
          color: priorityInfo.color,
        })],
        allowedMentions: { parse: [] },
      });
    } catch (presentationError) {
      logger.warn('Ticket priority saved but channel status display could not refresh',
        { channelId: channel.id, error: presentationError?.message });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'priority',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: updater.id,
        priority: priority,
        metadata: {
          previousPriority,
          updatedAt: ticketData.priorityUpdatedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'updateTicketPriority', 'Failed to update ticket priority. Please try again in a moment.', { guildId: channel?.guild?.id, channelId: channel?.id, updaterId: updater?.id, priority });
  }

  });
}

export async function closeInactiveTickets(client, inactivityMs = 72 * 60 * 60 * 1000) {
  const { getInactiveOpenTickets } = await import('../utils/database/tickets.js');
  let closed = 0;
  for (const guild of client.guilds.cache.values()) {
    const inactive = await getInactiveOpenTickets(guild.id, inactivityMs).catch(() => []);
    for (const ticket of inactive) {
      const channel = await guild.channels.fetch(ticket.id).catch(() => null);
      if (!channel) continue;
      try {
        await channel.send({
          embeds: [createEmbed({
            title: '⏰ Ticket Inactive',
            description: 'This ticket has been inactive for **72 hours** and will now be closed automatically. You can reopen it if needed.',
            color: 'warning',
          })],
        }).catch(() => {});
        await closeTicket(channel, client.user, 'Automatically closed after 72 hours of inactivity');
        closed += 1;
      } catch (error) {
        logger.warn('Failed to auto-close inactive ticket', { guildId: guild.id, channelId: ticket.id, error: error.message });
      }
    }
  }
  return closed;
}
