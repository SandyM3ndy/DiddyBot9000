import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';
import { withGuildLock } from './serverProgressionService.js';

// Suggestion decisions have no TTL. They survive restarts, unlike collectors.
export const SUGGESTION_STATUSES = Object.freeze({
  under_review:{label:'🟡 Under review',color:'primary'},
  planned:{label:'🗓️ Planned',color:'info'},
  accepted:{label:'✅ Accepted',color:'success'},
  declined:{label:'❌ Declined',color:'error'},
});
export function suggestionKey(guildId,id){
  if(!/^\d{17,20}$/.test(String(guildId)) || !/^\d{17,20}$/.test(String(id)))
    throw new Error('Invalid suggestion identifier');
  return 'guild:'+guildId+':suggestion:'+id;
}
export function renderSuggestionPost(state) {
  const status=SUGGESTION_STATUSES[state.status]||SUGGESTION_STATUSES.under_review;
  const idea=String(state.idea||'').slice(0,1000);
  const date=Math.floor(Date.parse(state.createdAt)/1000);
  const fields=[
    {name:'🙋 Suggested by',value:'<@'+state.authorId+'>',inline:true},
    {name:'📌 Status',value:status.label,inline:true},
  ];
  if(state.reviewedBy)fields.push({name:'🛡️ Reviewed by',value:'<@'+state.reviewedBy+'>',inline:true});
  const embed=createEmbed({
    title:'💡 Beacon • Community Suggestion',
    description:idea.replace(/@/g,'@\u200b'),
    color:status.color,fields,
    footer:'Beacon • Vote with reactions • Staff can update the status',
  });
  if(Number.isFinite(date)&&date>0)embed.setTimestamp(new Date(state.createdAt));
  const buttons=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('suggest_review:'+state.id)
      .setLabel('Staff Review').setEmoji('🛠️').setStyle(ButtonStyle.Secondary)
  );
  return {embeds:[embed],components:[buttons],allowedMentions:{parse:[]}};
}
export async function createSuggestionRecord(client,record){
  const key=suggestionKey(record.guildId,record.id);
  const stored=await client.db.set(key,record);
  if(stored===false)throw new Error('Suggestion storage rejected the write');
  return record;
}
export async function getSuggestionRecord(client,guildId,id){
  return client.db.get(suggestionKey(guildId,id),null);
}
export async function changeSuggestionStatus(client,guildId,id,status,moderatorId,messageId=null){
  if(!SUGGESTION_STATUSES[status])throw new Error('Invalid suggestion status');
  return withGuildLock('suggestion:'+guildId+':'+id,async()=>{
    const key=suggestionKey(guildId,id);
    const record=await client.db.get(key,null);
    if(!record||record.guildId!==guildId)return null;
    const updated={
      ...record,status,reviewedBy:moderatorId,reviewedAt:new Date().toISOString(),
      messageId:record.messageId||messageId,
    };
    const stored=await client.db.set(key,updated);
    if(stored===false)throw new Error('Suggestion status was not saved');
    return updated;
  },client);
}

export async function attachSuggestionMessage(client,guildId,id,messageId){
  return withGuildLock('suggestion:'+guildId+':'+id,async()=>{
    const key=suggestionKey(guildId,id);
    const record=await client.db.get(key,null);
    if(!record||record.guildId!==guildId)return null;
    if(record.messageId===messageId)return record;
    const next={...record,messageId};
    const stored=await client.db.set(key,next);
    if(stored===false)throw new Error('Suggestion message association was not saved');
    return next;
  },client);
}
