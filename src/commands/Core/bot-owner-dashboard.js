import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isBotOwner } from '../../config/bot.js';
import { buildOwnerDashboard } from './modules/ownerDashboardUi.js';

export default {
 data:new SlashCommandBuilder().setName('bot-owner-dashboard')
  .setDescription('Private Bot Owner Dashboard • manage Beacon operations'),
 category:'BotOwner',
 async execute(interaction){
  if(!isBotOwner(interaction.user?.id))
   return InteractionHelper.safeReply(interaction,{
    content:'This dashboard is restricted to configured Beacon bot owners.',
    flags:MessageFlags.Ephemeral,
   });
  return InteractionHelper.safeReply(interaction,{
   ...buildOwnerDashboard(interaction.client),flags:MessageFlags.Ephemeral,
  });
 },
};
