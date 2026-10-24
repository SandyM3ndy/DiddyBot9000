import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import create from './gcreate.js';
import remove from './gdelete.js';
import end from './gend.js';
import reroll from './greroll.js';

const actions = { create, delete: remove, end, reroll };
export default {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage community giveaways')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('create').setDescription('Start a giveaway in a channel')
      .addStringOption(o => o.setName('duration').setDescription('Duration, e.g. 1h, 3d').setMaxLength(20).setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(10).setRequired(true))
      .addStringOption(o => o.setName('prize').setDescription('Giveaway prize').setMaxLength(200).setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Giveaway channel (defaults to here)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sub => sub.setName('end').setDescription('Finish an active giveaway')
      .addStringOption(o => o.setName('messageid').setDescription('Giveaway message ID').setRequired(true)))
    .addSubcommand(sub => sub.setName('reroll').setDescription('Pick a new winner for an ended giveaway')
      .addStringOption(o => o.setName('messageid').setDescription('Giveaway message ID').setRequired(true)))
    .addSubcommand(sub => sub.setName('delete').setDescription('Delete a giveaway and its saved record')
      .addStringOption(o => o.setName('messageid').setDescription('Giveaway message ID').setRequired(true))),
  category: 'Giveaway',
  async execute(interaction, config, client) {
    const action = interaction.options.getSubcommand();
    if (!actions[action]) throw new Error('Unknown giveaway action');
    return actions[action].execute(interaction, config, client);
  },
};
