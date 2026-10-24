import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import add from './add.js';
import remove from './remove.js';
import rename from './rename.js';
import claim from './claim.js';
import close from './close.js';
import priority from './priority.js';
import stats from './ticketstats.js';

const actions = { add, remove, rename, claim, close, priority, stats };
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
    .addSubcommand(sub => sub.setName('stats').setDescription('View ticket statistics (staff only)')),
  category: 'Ticket',
  async execute(interaction, guildConfig, client) {
    const action = interaction.options.getSubcommand();
    if (!actions[action]) {
      return InteractionHelper.safeReply(interaction, { content: 'Unknown ticket action.', flags: MessageFlags.Ephemeral });
    }
    return actions[action].execute(interaction, guildConfig, client || interaction.client);
  },
};
