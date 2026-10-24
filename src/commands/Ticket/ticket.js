import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import add from './add.js';
import remove from './remove.js';
import rename from './rename.js';
import claim from './claim.js';
import close from './close.js';
import priority from './priority.js';
import stats from './ticketstats.js';
import ticketDashboard from './modules/ticket_dashboard.js';
import { getTicketSlaMinutes, configureTicketSla } from '../../services/ticketSlaService.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { showMyTickets, showTicketQueue, showTicketInfo, showTicketTranscript, reopenTicketAction, unclaimTicketAction } from './modules/ticketActions.js';

const openPanel = {
  async execute(interaction, guildConfig, client) {
    if (!interaction.guildId || !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeReply(interaction, {
        content: 'Manage Server permission is required to open the ticket settings dashboard.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    return ticketDashboard.execute(interaction, guildConfig, client || interaction.client);
  },
};
const slaAction = {
  async execute(interaction, _config, client) {
    if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeReply(interaction, { content: 'Manage Server is required to configure ticket reminders.', flags: MessageFlags.Ephemeral });
    }
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    try {
      const minutes = interaction.options.getInteger('minutes');
      if (minutes !== null) await configureTicketSla(client, interaction.guildId, minutes);
      const config = await getGuildConfig(client, interaction.guildId);
      const active = getTicketSlaMinutes(config);
      return InteractionHelper.safeEditReply(interaction, {
        content: active ? '⏰ First-reply SLA: **' + active +
          ' minutes**. Unanswered tickets trigger a one-time staff alert in the configured ticket log channel.'
          : '⚪ Ticket SLA alerts are disabled.',
      });
    } catch (error) {
      return InteractionHelper.safeEditReply(interaction, { content: '⚠️ ' + (error?.message || 'SLA configuration could not be saved.') });
    }
  },
};
const actions = { add, remove, rename, claim, close, priority, stats, sla: slaAction, panel: openPanel,
  my: { execute: showMyTickets }, queue: { execute: showTicketQueue },
  info: { execute: showTicketInfo }, transcript: { execute: showTicketTranscript }, reopen: { execute: reopenTicketAction },
  unclaim: { execute: unclaimTicketAction },
};
export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets and view private staff statistics')
    .setDMPermission(false)
    .addSubcommand(sub => sub.setName('add').setDescription('Add a member to this ticket')
      .addUserOption(o => o.setName('user').setDescription('Member to add').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a member from this ticket')
      .addUserOption(o => o.setName('user').setDescription('Member to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('rename').setDescription('Rename this ticket channel')
      .addStringOption(o => o.setName('name').setDescription('New channel name').setMaxLength(80).setRequired(true)))
    .addSubcommand(sub => sub.setName('claim').setDescription('Assign this ticket to yourself'))
    .addSubcommand(sub => sub.setName('close').setDescription('Close the current ticket')
      .addStringOption(o => o.setName('reason').setDescription('Why this ticket was closed')))
    .addSubcommand(sub => sub.setName('priority').setDescription('Set a support ticket priority')
      .addStringOption(o => o.setName('level').setDescription('Priority level').setRequired(true).addChoices(
        { name: 'Urgent', value: 'urgent' }, { name: 'High', value: 'high' },
        { name: 'Medium', value: 'medium' }, { name: 'Low', value: 'low' }, { name: 'None', value: 'none' },
      )))
    .addSubcommand(sub => sub.setName('stats').setDescription('View ticket statistics (staff only)'))
    .addSubcommand(sub => sub.setName('sla').setDescription('View or set staff first-response reminders (Manage Server)')
      .addIntegerOption(o => o.setName('minutes').setDescription('0 disables, or 5–1440 minute threshold').setMinValue(0).setMaxValue(1440)))
    .addSubcommand(sub => sub.setName('panel').setDescription('Open ticket system settings (Manage Server only)'))
    .addSubcommand(sub => sub.setName('my').setDescription('Show your private ticket history'))
    .addSubcommand(sub => sub.setName('queue').setDescription('Browse open support tickets (staff only)'))
    .addSubcommand(sub => sub.setName('info').setDescription('View status and assignment details for this ticket'))
    .addSubcommand(sub => sub.setName('transcript').setDescription('Export a private copy of the ticket conversation'))
    .addSubcommand(sub => sub.setName('reopen').setDescription('Reopen a closed ticket (staff only)'))
    .addSubcommand(sub => sub.setName('unclaim').setDescription('Release your assignment and return the ticket to the queue')),
  category: 'Ticket',
  async execute(interaction, guildConfig, client) {
    const action = interaction.options.getSubcommand();
    if (!actions[action]) {
      return InteractionHelper.safeReply(interaction, { content: 'Unknown ticket action.', flags: MessageFlags.Ephemeral });
    }
    return actions[action].execute(interaction, guildConfig, client || interaction.client);
  },
};
