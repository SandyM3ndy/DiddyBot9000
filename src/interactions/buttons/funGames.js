import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { build8BallPayload, buildRpsChoicePayload, buildRpsResultPayload } from '../../services/funGamesService.js';

async function rejectOtherPlayer(interaction,ownerId){
  if(interaction.user.id===ownerId)return false;
  await InteractionHelper.safeReply(interaction,{
    content:'🎮 This round belongs to someone else! Use **/8ball** or **/rps** to play your own.',
    flags:MessageFlags.Ephemeral,
  });
  return true;
}
export default [
  {
    name:'fun_8ball_again',
    async execute(interaction,_client,args=[]){
      const playerId=args[0];
      if(await rejectOtherPlayer(interaction,playerId))return;
      const question=interaction.message?.embeds?.[0]?.fields?.find(field=>
        field.name==='❓ Your Question')?.value;
      if(!question){
        return InteractionHelper.safeReply(interaction,{
          content:'⚠️ This 8-ball question is no longer available. Use **/8ball** to ask a new one.',
          flags:MessageFlags.Ephemeral,
        });
      }
      // Update the original message, not a public stream of repeated replies.
      return interaction.update(build8BallPayload(question,playerId));
    },
  },
  {
    name:'fun_rps',
    async execute(interaction,_client,args=[]){
      const [move,playerId]=args;
      if(await rejectOtherPlayer(interaction,playerId))return;
      if(move==='again'){
        return interaction.update(buildRpsChoicePayload(playerId));
      }
      if(!['rock','paper','scissors'].includes(move)){
        return InteractionHelper.safeReply(interaction,{
          content:'⚠️ Invalid game move. Start a fresh game using **/rps**.',
          flags:MessageFlags.Ephemeral,
        });
      }
      return interaction.update(buildRpsResultPayload(playerId,move));
    },
  },
];
