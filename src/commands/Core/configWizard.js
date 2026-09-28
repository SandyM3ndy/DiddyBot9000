async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        if (setting === 'serverProgressionEnabled' && submitted.guild?.ownerId !== submitted.user.id) {
            throw new Error('Only the server owner can enable or disable Server Progression.');
        }

        let value = resolveSettingModalValue(setting, submitted);
        if (setting === 'updatesChannelId' && value !== null) {
            value = await validateGuildChannelId(submitted.guild, value);
        }
        const configKey = setting === 'serverProgressionEnabled'
            ? 'serverProgression'
            : setting === 'updatesChannelId'
                ? 'updates'
                : setting;
        const configValue = setting === 'serverProgressionEnabled'
            ? { enabled: value }
            : setting === 'updatesChannelId'
                ? { channelId: value }
                : value;
        await ConfigService.updateSetting(client, guildId, configKey, configValue, submitted.user.id);

        await InteractionHelper.safeReply(submitted, {
            embeds: [successEmbed('Configuration Updated', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Config wizard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'Please try again.',
        }).catch(() => {});
    }
}
