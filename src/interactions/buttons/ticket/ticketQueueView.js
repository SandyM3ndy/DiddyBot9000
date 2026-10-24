import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { loadTicketCommandCenter } from '../../../utils/ticket/ticketCommandCenter.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
 name:'ticket_queue_view',
 async execute(interaction,client,args=[]){
  if(!interaction.guildId)return InteractionHelper.safeReply(interaction,{
   content:'Use this in a Discord server.',flags:MessageFlags.Ephemeral,
  });
  // Acknowledge immediately: the ticket DB may be busy.
  if(!interaction.deferred&&!interaction.replied){
   try{await interaction.deferUpdate();}catch{return;}
  }
  try{
   const ctx=await getTicketPermissionContext({client,interaction});
   const allowed=interaction.guild?.ownerId===interaction.user.id
     ||ctx.hasManageChannels||ctx.hasTicketStaffRole
     ||interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
   if(!allowed)return interaction.followUp({
    content:'🔒 Only authorised support staff may view the ticket command center.',
    flags:MessageFlags.Ephemeral,
   });
   const filter=args[0]||'open';
   const page=Math.max(0,Math.min(500,Number(args[1])||0));
   const payload=await loadTicketCommandCenter(client,interaction.guildId,filter,page);
   return interaction.editReply(payload);
  }catch{
   return interaction.followUp({
    content:'⚠️ Could not refresh the support queue. Your tickets were not changed.',
    flags:MessageFlags.Ephemeral,
   }).catch(()=>{});
  }
 },
};
