import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll for your server')
        .addStringOption(o => o.setName('question').setDescription('The poll question').setRequired(true).setMaxLength(200))
        .addStringOption(o => o.setName('options').setDescription('Options separated with | (2-10 options)').setRequired(true).setMaxLength(1000))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString()),

    async execute(interaction) {
        const question = interaction.options.getString('question', true).trim();
        const choices = interaction.options.getString('options', true).split('|').map(v => v.trim()).filter(Boolean);

        if (choices.length < 2 || choices.length > 10) {
            return InteractionHelper.safeReply(interaction, {
                content: 'You need between 2 and 10 options, separated with |.',
                ephemeral: true,
            });
        }

        const embed = createEmbed({
            title: '📊 Poll',
            description: '**' + question + '**\\n\\n' + choices.map((choice, i) => EMOJIS[i] + ' ' + choice).join('\\n'),
            color: 'primary',
        }).setFooter({ text: 'Poll by ' + interaction.user.tag }).setTimestamp();

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });
        const message = await interaction.fetchReply();

        for (let i = 0; i < choices.length; i++) {
            await message.react(EMOJIS[i]).catch(() => {});
        }
    },
};