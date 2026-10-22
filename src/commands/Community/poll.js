import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

const VOTES = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
function readOptions(options) {
  const joined = options.getString('options');
  if (joined?.trim()) return joined.split('|').map(s => s.trim()).filter(Boolean);
  const values = [];
  for (let i = 1; i <= 10; i++) {
    const value = options.getString(`option${i}`);
    if (value?.trim()) values.push(value.trim());
  }
  return values;
}

const builder = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create a community poll with 2–10 reaction choices')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption(o => o.setName('question').setDescription('What are you asking?').setRequired(true).setMaxLength(200))
  .addStringOption(o => o.setName('options').setDescription('Separate 2–10 options with | (or use option1 and option2)').setMaxLength(1000));
for (let i = 1; i <= 10; i++) {
  builder.addStringOption(o => o.setName(`option${i}`)
    .setDescription(`Choice ${i} (alternative to the options field)`).setMaxLength(100));
}

export default {
  data: builder,
  category: 'Community',
  async execute(interaction) {
    if (!(await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral }))) return;
    const question = interaction.options.getString('question', true).trim();
    const choices = readOptions(interaction.options);
    if (!question || choices.length < 2 || choices.length > 10 || choices.some(v => v.length > 100)) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Provide a question and 2–10 choices. Use `options` separated with `|`, or fill in option1, option2, etc. Each choice must be 100 characters or less.',
      });
    }
    const channel = interaction.channel;
    const member = interaction.guild?.members?.me || await interaction.guild?.members?.fetchMe?.().catch(() => null);
    if (!channel?.send || !member || !channel.permissionsFor(member)?.has([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ReadMessageHistory,
    ])) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Beacon needs View Channel, Send Messages, Embed Links, Add Reactions and Read Message History to create polls here.',
      });
    }
    const embed = createEmbed({
      title: '📊 Community Poll',
      description: `**${question}**\n\n` + choices.map((v,i) => `${VOTES[i]} ${v}`).join('\n'),
      color: 'primary',
    }).setFooter({ text: 'React below to vote • Votes are visible to other members' }).setTimestamp();
    try {
      const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      const reactionResults = await Promise.allSettled(choices.map((_,i) => message.react(VOTES[i])));
      const failed = reactionResults.filter(r => r.status === 'rejected').length;
      return InteractionHelper.safeEditReply(interaction, {
        content: `✅ Poll posted: ${message.url}` + (failed ? `\n⚠️ ${failed} reaction(s) could not be added; check bot permissions.` : ''),
      });
    } catch (error) {
      logger.warn('Failed to create poll', { guildId: interaction.guildId, error: error?.message });
      return InteractionHelper.safeEditReply(interaction, { content: 'Could not post this poll. Check Beacon’s channel permissions and try again.' });
    }
  },
};
