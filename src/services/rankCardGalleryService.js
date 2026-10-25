/** Durable rank-card views. Never mutate progression, coins or cosmetics. */
import { ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle } from 'discord.js';
import { renderProgressionRankPng } from '../utils/progressionRankCard.js';
import { createEmbed } from '../utils/embeds.js';
import { getServerProgression,getGlobalProgressionLeaderboard,getLevelProgress,getFoundingBadge } from './serverProgressionService.js';
import { SAND_CATALOG,SAND_SLOTS,getSandServer,getSandAppearance,getSandCatalogItem } from './sandCoinsService.js';

const PREFIX='beacon:rank-card:v1:snapshot:';
const ID=/^\d{17,20}$/;
const tick=String.fromCharCode(96);
const short=value=>String(value||'Unknown Server').replace(/[@*_~<>|]/g,'').replaceAll(tick,'').slice(0,70);
export const isRankCardId=value=>ID.test(String(value||''));
export const rankCardSaveKey=id=>PREFIX+id;

export async function loadLiveRankCard(client,targetId){
 if(!isRankCardId(targetId))throw new Error('INVALID_SERVER_ID');
 const guild=client.guilds?.cache?.get(targetId);
 if(!guild)throw new Error('SERVER_NOT_FOUND');
 // Respect disabled progression and leaderboard privacy opt-out.
 const entries=await getGlobalProgressionLeaderboard(client);
 const index=entries.findIndex(item=>item.guildId===targetId);
 if(index<0)throw new Error('PROGRESSION_NOT_PUBLIC');
 const [data,founder,server]=await Promise.all([
  getServerProgression(client,targetId),getFoundingBadge(client,targetId),getSandServer(client,targetId),
 ]);
 return {
  version:1,guildId:targetId,guildName:short(guild.name),
  rank:index+1,rankedServers:entries.length,
  xp:Math.max(0,Math.floor(data.xp)),level:Math.max(1,Math.floor(data.level)),
  progress:getLevelProgress(data).percent,
  founder:founder?{number:founder.number}:null,
  appearance:getSandAppearance(server),
  inventory:server.inventory.filter(id=>getSandCatalogItem(id)).slice(0,70),
 };
}
export function rankCardButtons(targetId,ownerId,view='live',hasSaved=false){
 if(!isRankCardId(targetId)||!isRankCardId(ownerId))throw new Error('INVALID_ID');
 const button=(action,label,emoji,active=false,disabled=false)=>
  new ButtonBuilder().setCustomId('rank_card:'+action+':'+targetId+':'+ownerId)
   .setLabel(label).setEmoji(emoji)
   .setStyle(active?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(disabled);
 return [new ActionRowBuilder().addComponents(
  button('live','Live Rank Card','🏆',view==='live'),
  button('cosmetics','Cosmetics','🎨',view==='cosmetics'),
  button('save','Save Snapshot','💾'),
  button('saved','Saved Card','📸',view==='saved',!hasSaved),
 )];
}

const renderCache=new Map();
function cachedPng(card){
 const key=JSON.stringify([card.guildName,card.rank,card.level,card.xp,card.progress,card.founder,card.appearance]);
 const result=renderCache.get(key);
 if(result){renderCache.delete(key);renderCache.set(key,result);return result;}
 const png=renderProgressionRankPng({
  name:card.guildName,rank:card.rank,level:card.level,xp:card.xp,progress:card.progress,
  founder:card.founder,appearance:card.appearance,fastPreview:true,
 });
 renderCache.set(key,png);
 if(renderCache.size>32)renderCache.delete(renderCache.keys().next().value);
 return png;
}
const itemName=id=>SAND_CATALOG.find(item=>item.id===id)?.name||'None equipped';
export function buildRankCardDisplay(card,{view='live',ownerId,hasSaved=false}={}){
 if(!isRankCardId(card?.guildId)||!isRankCardId(ownerId))throw new Error('INVALID_RANK_CARD');
 const saved=view==='saved',cosmetics=view==='cosmetics';
 let embed,files=[];
 if(cosmetics){
  const appearance=card.appearance||{},owned=card.inventory||[];
  const fields=[
   {name:'🖼️ Frame',value:'**'+itemName(appearance.border)+'**',inline:true},
   {name:'🏷️ Name Tag',value:'**'+itemName(appearance.tag)+'**',inline:true},
   {name:'🌄 Background',value:'**'+itemName(appearance.background)+'**',inline:true},
  ];
  for(const slot of SAND_SLOTS){
   const category=slot==='border'?'Frames':slot==='tag'?'Name Tags':'Backgrounds';
   const items=SAND_CATALOG.filter(item=>item.type===slot&&owned.includes(item.id));
   fields.push({name:category+' Owned',value:items.map(item=>
    (appearance[slot]===item.id?'✅ ':'▫️ ')+item.name+(item.limited?' • Limited':'')
   ).join('\n')||'No cosmetics collected yet.'});
  }
  embed=createEmbed({
   title:'🎨 '+short(card.guildName)+' • Cosmetic Collection',
   description:'Cosmetics belong to this server and stay in its persistent inventory.\n'+
    '**'+owned.length+' items** • Level '+card.level+' • '+card.xp.toLocaleString('en-US')+' XP',
   fields,color:'primary',
   footer:'Live Rank Card returns to the image • Save Snapshot preserves the current look',
  });
 }else{
  embed=createEmbed({
   title:saved?'📸 Saved Rank Card':'🏆 Beacon • Server Rank Card',
   description:'**'+short(card.guildName)+'** • Level **'+card.level+'** • **'+card.xp.toLocaleString('en-US')+' XP**\n'+
    '🌍 World rank: '+(card.rank?'#'+card.rank+' / '+card.rankedServers:'Unranked')+
    '\nServer ID: '+tick+card.guildId+tick+
    (saved?'\n**Saved snapshot** • Stats and cosmetics are frozen at the time of saving.':
     '\n**Live card** • Refresh to see the latest XP and equipped cosmetics.'),
   color:'primary',footer:saved?'Stored in Beacon database':'Share your style • Save Snapshot to keep this appearance',
  });
  const filename='beacon-rank-card.png';
  embed.setImage('attachment://'+filename);
  files=[new AttachmentBuilder(cachedPng(card),{name:filename})];
 }
 return {embeds:[embed],files,attachments:[],components:rankCardButtons(card.guildId,ownerId,view,hasSaved),
  allowedMentions:{parse:[]}};
}
export async function saveRankCardSnapshot(client,messageId,card,ownerId){
 if(!isRankCardId(messageId)||!isRankCardId(ownerId)||!isRankCardId(card?.guildId))throw new Error('INVALID_ID');
 const result={version:1,savedAt:new Date().toISOString(),ownerId,card:structuredClone(card)};
 const success=await client.db.set(rankCardSaveKey(messageId),result);
 if(success===false)throw new Error('SNAPSHOT_SAVE_FAILED');
 return result;
}
export async function readRankCardSnapshot(client,messageId,expectedId=null){
 if(!isRankCardId(messageId))return null;
 const saved=await client.db.get(rankCardSaveKey(messageId),null);
 if(!saved||saved.version!==1||!isRankCardId(saved.card?.guildId))return null;
 if(expectedId&&saved.card.guildId!==expectedId)return null;
 // A revoked Founder badge cannot stay visible in historic saved cards.
 if(saved.card.founder){
  const {getFoundingBadge}=await import('./serverProgressionService.js');
  const current=await getFoundingBadge(client,saved.card.guildId);
  if(!current||current.number!==saved.card.founder.number)
   return {...saved,card:{...saved.card,founder:null}};
 }
 return saved;
}
