import { SlashCommandBuilder } from 'discord.js';
import flip from './flip.js';
import roll from './roll.js';

// Reuse the existing coin and dice handlers; only their slash command names move.
export default {
  category: 'Fun',
  data: new SlashCommandBuilder()
    .setName('random')
    .setDescription('Flip a coin or roll dice')
    .addSubcommand(s => s.setName('coin').setDescription('Flip a coin (heads or tails)'))
    .addSubcommand(s => s.setName('dice').setDescription('Roll dice, e.g. 2d6+5')
      .addStringOption(o => o.setName('notation').setDescription('Dice notation, e.g. 2d6+5')
        .setRequired(true).setMaxLength(50))),
  async execute(interaction, config, client) {
    switch (interaction.options.getSubcommand()) {
      case 'coin': return flip.execute(interaction, config, client);
      case 'dice': return roll.execute(interaction, config, client);
      default: throw new Error('Unknown random command action');
    }
  },
};
