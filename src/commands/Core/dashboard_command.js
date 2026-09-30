import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Open the Beacon server dashboard')
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: 'You need the **Manage Server** permission to use the Beacon dashboard.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const config = await getGuildConfig(interaction.client, interaction.guildId);

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Beacon Server Dashboard')
            .setDescription(`Configure Beacon for **${interaction.guild.name}** using the menu below.`)
            .addFields(
                { name: '🛠️ Command Access', value: 'Manage which commands and categories are enabled.', inline: false },
                { name: '📝 Logging', value: 'Configure Beacon logging.', inline: false },
                { name: '👋 Welcome & Goodbye', value: 'Configure welcome and goodbye messages.', inline: false },
                { name: '🎫 Tickets', value: 'Configure the ticket system.', inline: false },
                { name: '🔊 Join to Create', value: 'Configure temporary voice channels.', inline: false },
                { name: '🎭 Reaction Roles', value: 'Manage reaction-role panels.', inline: false },
            )
            .setFooter({ text: 'Beacon • Server configuration' });

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`beacon_dashboard:${interaction.guildId}`)
            .setPlaceholder('⚙️ Choose a configuration section...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Command Access').setDescription('Manage command availability').setValue('commands').setEmoji('🛠️'),
                new StringSelectMenuOptionBuilder().setLabel('Logging').setDescription('Configure logging').setValue('logging').setEmoji('📝'),
                new StringSelectMenuOptionBuilder().setLabel('Welcome & Goodbye').setDescription('Configure member greetings').setValue('welcome').setEmoji('👋'),
                new StringSelectMenuOptionBuilder().setLabel('Tickets').setDescription('Configure the ticket system').setValue('tickets').setEmoji('🎫'),
                new StringSelectMenuOptionBuilder().setLabel('Join to Create').setDescription('Configure temporary voice channels').setValue('jointocreate').setEmoji('🔊'),
                new StringSelectMenuOptionBuilder().setLabel('Reaction Roles').setDescription('Manage reaction-role panels').setValue('reactionroles').setEmoji('🎭'),
            );

        const message = await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(menu)],
        });

        const collector = message.createMessageComponentCollector({
            time: 600_000,
            filter: component => component.user.id === interaction.user.id && component.customId === `beacon_dashboard:${interaction.guildId}`,
        });

        collector.on('collect', async component => {
            const selected = component.values[0];
            try {
                await component.deferUpdate();
                const currentConfig = await getGuildConfig(interaction.client, interaction.guildId);

                if (selected === 'commands') {
                    const module = await import('./modules/commands_dashboard.js');
                    collector.stop('commands');
                    return module.default.execute(interaction, currentConfig, interaction.client);
                }
                if (selected === 'logging') {
                    const module = await import('../Logging/modules/logging_dashboard.js');
                    collector.stop('logging');
                    return module.default.execute(interaction, currentConfig, interaction.client);
                }
                if (selected === 'welcome') {
                    const module = await import('../Welcome/modules/greet_dashboard.js');
                    collector.stop('welcome');
                    return module.default.execute(interaction, currentConfig, interaction.client);
                }
                if (selected === 'tickets') {
                    const module = await import('../Ticket/modules/ticket_dashboard.js');
                    collector.stop('tickets');
                    return module.default.execute(interaction, currentConfig, interaction.client);
                }
                if (selected === 'jointocreate') {
                    const module = await import('./modules/dashboardFeaturePanels.js');
                    collector.stop('jointocreate');
                    return module.openDashboardFeature('joinToCreate', interaction);
                }
                if (selected === 'reactionroles') {
                    const module = await import('./modules/dashboardFeaturePanels.js');
                    collector.stop('reactionroles');
                    return module.openDashboardFeature('reactionRoles', interaction);
                }
            } catch (error) {
                await interaction.followUp({
                    content: `I couldn't open that dashboard section: ${error.message}`,
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
        });
    },
};
