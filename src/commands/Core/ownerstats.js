import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isPrimaryBotOwner } from '../../config/bot.js';
import { buildOwnerDashboard } from './modules/ownerDashboardUi.js';

export default {
 data:new SlashCommandBuilder().setName('ownerstats')
  .setDescription('Private Bot Owner Dashboard • manage Beacon operations'),
 category:'BotOwner',
 async execute(interaction){
  if(!isPrimaryBotOwner(interaction.user?.id))
   return InteractionHelper.safeReply(interaction,{
    content:'Only the primary Beacon owner can open this dashboard.',
    flags:MessageFlags.Ephemeral,
   });
  return InteractionHelper.safeReply(interaction,{
   ...buildOwnerDashboard(interaction.client),flags:MessageFlags.Ephemeral,
  });
 },
};
