import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Configure server shop settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Set the Discord role granted when the Premium Role shop item is purchased.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to grant for Premium Role purchases.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
};
