import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { generateSecurePassword } from '../../utils/securePassword.js';

export default {
  data: new SlashCommandBuilder()
    .setName('generatepassword')
    .setDescription('Generate a cryptographically secure password (only you can see it)')
    .addIntegerOption(o => o.setName('length').setDescription('Length (8–50; default 16)').setMinValue(8).setMaxValue(50))
    .addBooleanOption(o => o.setName('uppercase').setDescription('Include uppercase letters (default yes)'))
    .addBooleanOption(o => o.setName('numbers').setDescription('Include numbers (default yes)'))
    .addBooleanOption(o => o.setName('symbols').setDescription('Include symbols (default yes)')),
  category: 'Tools',

  async execute(interaction) {
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const length = interaction.options.getInteger('length') ?? 16;
    const uppercase = interaction.options.getBoolean('uppercase') ?? true;
    const numbers = interaction.options.getBoolean('numbers') ?? true;
    const symbols = interaction.options.getBoolean('symbols') ?? true;
    const password = generateSecurePassword({ length, uppercase, numbers, symbols });
    const groups = ['Lowercase', ...(uppercase ? ['Uppercase'] : []), ...(numbers ? ['Numbers'] : []), ...(symbols ? ['Symbols'] : [])];
    const embed = successEmbed(
      '🔑 Secure Password',
      `**Password:** ||\`${password}\`||\n` +
      `**Length:** ${password.length} characters\n` +
      `**Contains:** ${groups.join(', ')}\n\n` +
      '*Private response. Store this in a password manager and never share it.*'
    );
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  },
};
