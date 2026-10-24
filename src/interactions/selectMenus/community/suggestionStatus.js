import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { canReviewSuggestion } from '../../buttons/community/suggestionReview.js';
import { changeSuggestionStatus, renderSuggestionPost, SUGGESTION_STATUSES } from '../../../services/suggestionReviewService.js';

export default {
  name:'suggest_status',
  async execute(interaction,client,args=[]){
    if(!interaction.guildId || !canReviewSuggestion(interaction)) {
      return InteractionHelper.safeReply(interaction,{
        content:'🔒 Only authorised moderators may change the status of suggestions.',
        flags:MessageFlags.Ephemeral,
      });
    }
    if(!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
    const id=args[0];
    const status=interaction.values?.[0];
    if(!SUGGESTION_STATUSES[status]) {
      return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Invalid suggestion status.'});
    }
    let record;
    try {
      record=await changeSuggestionStatus(client,interaction.guildId,id,status,interaction.user.id);
    }catch{
      return InteractionHelper.safeEditReply(interaction,{
        content:'❌ This decision could not be saved. The suggestion was not updated.',
      });
    }
    if(!record)return InteractionHelper.safeEditReply(interaction,{content:'⚠️ Suggestion not found in saved records.'});
    try {
      const channel=interaction.guild.channels.cache.get(record.channelId)
        || await interaction.guild.channels.fetch(record.channelId);
      if(!channel?.messages?.fetch || !record.messageId)throw new Error('No editable public suggestion');
      const publicPost=await channel.messages.fetch(record.messageId);
      await publicPost.edit(renderSuggestionPost(record));
      return InteractionHelper.safeEditReply(interaction,{
        content:'✅ Suggestion marked **'+SUGGESTION_STATUSES[status].label+'**. The decision is saved and its public card has been updated.',
        components:[],
      });
    }catch{
      // Do NOT roll back a saved staff decision just because Discord editing
      // failed. A later staff click can refresh the original post from storage.
      return InteractionHelper.safeEditReply(interaction,{
        content:'✅ Decision saved as **'+SUGGESTION_STATUSES[status].label+
          '**, but Discord could not update the public post. Check Beacon’s channel permissions and retry.',
        components:[],
      });
    }
  },
};
