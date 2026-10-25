import { MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import {
 isRankCardId,loadLiveRankCard,buildRankCardDisplay,
 saveRankCardSnapshot,readRankCardSnapshot,getRankCardLikes,toggleRankCardLike,
} from '../../services/rankCardGalleryService.js';

// Permanent globally registered buttons: never expire when a collector does,
// and card messages remain interactive after bot restarts.
const tasks=new Map();
function getState(messageId){
 let state=tasks.get(messageId);
 if(!state){
  state={revision:0,queue:Promise.resolve()};
  tasks.set(messageId,state);
  if(tasks.size>200)tasks.delete(tasks.keys().next().value);
 }
 return state;
}
const actions=new Set(['live','cosmetics','save','saved','like']);

export async function handleRankCardButton(interaction,client,args=[]){
 const [action,targetId,ownerId]=args;
 if(!interaction.message?.id||!interaction.guildId||!actions.has(action)||
    !isRankCardId(targetId)||!isRankCardId(ownerId)){
  return interaction.reply({content:'This rank-card control is invalid. Use /rank card to create a new panel.',
   flags:MessageFlags.Ephemeral}).catch(()=>{});
 }
 if(action==='save'&&interaction.user.id!==ownerId){
  return interaction.reply({
   content:'Only the person who posted this rank card can save or replace its snapshot.',
   flags:MessageFlags.Ephemeral,
  }).catch(()=>{});
 }
 const state=getState(interaction.message.id);
 const revision=++state.revision;
 try{await interaction.deferUpdate();}catch(error){
  logger.debug('Rank card button acknowledge failed',{error:error.message});
  return;
 }
 const run=async()=>{
  if(action!=='save' && action!=='like' && revision!==state.revision)return;
  try{
   const previous=await readRankCardSnapshot(client,interaction.message.id,targetId);
   let card,view=action;
   if(action==='like'){
    // Persist before editing the public message. Everyone has their own
    // like entitlement, so rapid presses never generate duplicate likes.
    await toggleRankCardLike(client,interaction.message.id,interaction.user.id);
    const title=interaction.message?.embeds?.[0]?.title||'';
    view=title.includes('Cosmetic Collection')?'cosmetics':
      title.includes('Saved Rank Card')?'saved':'live';
   }
   if(view==='saved'){
    if(!previous){
     if(action==='saved')
      await interaction.followUp({content:'No saved snapshot for this rank card yet. Press Save Snapshot first.',
       flags:MessageFlags.Ephemeral}).catch(()=>{});
     if(action==='like')view='live';
     else return;
    }else card=previous.card;
   }
   if(!card){
    card=await loadLiveRankCard(client,targetId);
    if(action==='save'){
     // Store stats and equipped cosmetics without affecting likes.
     await saveRankCardSnapshot(client,interaction.message.id,card,ownerId);
     view='saved';
    }
   }
   const reactions=await getRankCardLikes(client,interaction.message.id);
   if(revision!==state.revision)return;
   const payload=buildRankCardDisplay(card,{
    ownerId,view,hasSaved:action==='save'||Boolean(previous),likes:reactions.count,
   });
   await interaction.editReply(payload);
  }catch(error){
   logger.warn('Rank card gallery button failed',{
    action,targetId,guildId:interaction.guildId,error:error.message,
   });
   const reason=error.message==='PROGRESSION_NOT_PUBLIC'||error.message==='SERVER_NOT_FOUND'
    ?'The target server is no longer available for public rank-card lookups. A previously saved snapshot may still be viewed.'
    :error.message==='SNAPSHOT_SAVE_FAILED'
    ?'Beacon could not store this snapshot. Your existing saved card has not been confirmed.'
    :'Could not update this rank card. No coins or cosmetics were changed.';
   await interaction.followUp({content:'⚠️ '+reason,flags:MessageFlags.Ephemeral}).catch(()=>{});
  }
 };
 // Each public card has a separate queue. A burst of clicks only updates the
 // message for the newest selection, without "button unavailable" errors.
 state.queue=state.queue.catch(()=>{}).then(run);
 await state.queue;
}
export default {
 name:'rank_card',
 execute:handleRankCardButton,
};
