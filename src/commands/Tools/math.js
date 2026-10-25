import { SlashCommandBuilder } from 'discord.js';
import calculate from './calculate.js';
import baseconvert from './baseconvert.js';

// Pull choices from the maintained conversion handler to prevent the formats
// from getting out of sync as Beacon adds more encodings.
const BASE_CHOICES = baseconvert.data.toJSON().options.find(o => o.name === 'from').choices;

export default {
  category: 'Tools',
  data: new SlashCommandBuilder()
    .setName('math')
    .setDescription('Calculator and number-base conversion tools')
    .addSubcommand(s => s.setName('calculate').setDescription('Evaluate a mathematical expression')
      .addStringOption(o => o.setName('expression')
        .setDescription('Expression, e.g. 2+2*3 or sin(45 deg)')
        .setMaxLength(200).setRequired(true)))
    .addSubcommand(s => s.setName('convert').setDescription('Convert numbers between binary, hex and other bases')
      .addStringOption(o => o.setName('number').setDescription('Number to convert').setRequired(true))
      .addStringOption(o => o.setName('from').setDescription('Source base/format').setRequired(true)
        .addChoices(...BASE_CHOICES))
      .addStringOption(o => o.setName('to').setDescription('Target base/format (defaults to all)')
        .addChoices(...BASE_CHOICES))),
  async execute(interaction, config, client) {
    switch (interaction.options.getSubcommand()) {
      case 'calculate': return calculate.execute(interaction, config, client);
      case 'convert': return baseconvert.execute(interaction, config, client);
      default: throw new Error('Unknown math command action');
    }
  },
};
