import { SlashCommandBuilder, MessageFlags,InteractionContextType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isPrimaryBotOwner } from '../../config/bot.js';
import { buildOwnerPasswordChallenge } from './modules/ownerDashboardSecurity.js';

export default {
 data:new SlashCommandBuilder().setName('bot-owner-dashboard')
  .setDescription('Private Bot Owner Dashboard • manage Beacon operations')
  // Discord hides this from regular members; admins can still inspect application
  // commands in Integrations. Every execution is separately ID/password guarded.
  .setDefaultMemberPermissions(0n)
  .setContexts(InteractionContextType.Guild),
 category:'BotOwner',
 async execute(interaction){
  if(!isPrimaryBotOwner(interaction.user?.id))
   return InteractionHelper.safeReply(interaction,{
    content:'🔒 Access denied.',
    flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
   });
  // Never show dashboard data, buttons, or controls before password entry.
  return interaction.showModal(buildOwnerPasswordChallenge(interaction.user.id));
 },
};
