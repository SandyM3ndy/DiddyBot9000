import {
  PermissionFlagsBits, MessageFlags, ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { createEmbed } from '../../../utils/embeds.js';
import {
  getSuggestionRecord, attachSuggestionMessage, SUGGESTION_STATUSES,
} from '../../../services/suggestionReviewService.js';

export function canReviewSuggestion(interaction){
  return Boolean(interaction.guild?.ownerId === interaction.user.id ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages));
}
export default {
  name:'suggest_review',
  async execute(interaction,client,args=[]){
    if(!interaction.guildId || !canReviewSuggestion(interaction)){
      return InteractionHelper.safeReply(interaction,{
        content:'🔒 Only server staff with Manage Messages or Manage Server can review suggestions.',
        flags:MessageFlags.Ephemeral,
      });
    }
    if(!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
    try{
      const id=args[0];
      const record=await getSuggestionRecord(client,interaction.guildId,id);
      if(!record || record.channelId!==interaction.channelId) {
        return InteractionHelper.safeEditReply(interaction,{content:'⚠️ This suggestion was not found in saved records.'});
      }
      // The public panel itself is the source of its message ID; attach it
      // even if the bot restarted between creation and review.
      await attachSuggestionMessage(client,interaction.guildId,id,interaction.message.id);
      const menu=new StringSelectMenuBuilder().setCustomId('suggest_status:'+id)
        .setPlaceholder('Select a review decision...')
        .addOptions(Object.entries(SUGGESTION_STATUSES).map(([status,data])=>({
          label:data.label,description:'Set suggestion status to '+status.replaceAll('_',' '),
          value:status,
        })));
      const row=new ActionRowBuilder().addComponents(menu);
      return InteractionHelper.safeEditReply(interaction,{
        embeds:[createEmbed({
          title:'🛠️ Beacon • Suggestion Review',
          description:'**Current status:** '+SUGGESTION_STATUSES[record.status]?.label+
            '\n\nChoose a decision below. The decision will be saved and reflected on the original public post. Votes remain unchanged.',
          color:'primary',
        })],
        components:[row],allowedMentions:{parse:[]},
      });
    }catch{
      return InteractionHelper.safeEditReply(interaction,{
        content:'⚠️ Could not load this suggestion review. No decision was changed.',
      });
    }
  },
};
