import { SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getTreasury,TREASURY_DEFENCES,TREASURY_POTIONS,TREASURY_MIN_HEIST,TREASURY_TOGGLE_COOLDOWN_MS } from '../../services/treasuryService.js';

const B=(id,label,emoji,primary=false,disabled=false)=>new ButtonBuilder()
 .setCustomId('treasury:'+id).setLabel(label).setEmoji(emoji)
 .setStyle(primary?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(disabled);
const fmt=n=>Math.floor(n).toLocaleString('en-US');
const relative=ms=>'<t:'+Math.floor(ms/1000)+':R>';
export function treasuryManager(i){return i.guild?.ownerId===i.user?.id||i.memberPermissions?.has('ManageGuild');}
export function treasuryOwner(i){return i.guild?.ownerId===i.user?.id;}
export async function buildTreasuryPanel(client,guildId,view='home',page=0){
 const state=await getTreasury(client,guildId),def=TREASURY_DEFENCES[state.defence-1];
 const now=Date.now(),eligible=state.enabled&&state.balance>=TREASURY_MIN_HEIST;
 const fields=[],buttons=[
  new ActionRowBuilder().addComponents(
   B('home','Overview','🏦',view==='home'),B('shop','Potion Shop','🧪',view==='shop'),
   B('defence','Defences','🛡️',view==='defence'),
   B('history','History','📜',view==='history'),
   B('stats','Stats','📊',view==='stats')),
 ];
 let title='🏦 Beacon • Community Treasury',description='';
 if(view==='shop'){
  title='🧪 Treasury Potion Shop';
  description='Treasury funds buy boosts for your entire community. Only the owner/admins can purchase or activate potions.\n\n'+
   '**2× Sand Coins** — '+fmt(TREASURY_POTIONS.coins.price)+' SC • 2 hours, eligible quest earnings\n'+
   '**2× Server XP** — '+fmt(TREASURY_POTIONS.xp.price)+' SC • 2 hours, activity XP only\n\n'+
   'Coin earning caps still apply. The XP boost never multiplies quest completion rewards.';
  fields.push({name:'Potion Inventory',value:
   '🪙 Coin potions: **'+state.potions.coins+'**'+(state.active.coins>now?' • Active '+relative(state.active.coins):'')+
   '\n✨ XP potions: **'+state.potions.xp+'**'+(state.active.xp>now?' • Active '+relative(state.active.xp):'')});
  buttons.push(new ActionRowBuilder().addComponents(
   B('buycoins','Buy Coin Potion','🪙'),B('buyxp','Buy XP Potion','✨'),
   B('usecoins','Use Coin Potion','▶️',false,state.potions.coins<1||state.active.coins>now),
   B('usexp','Use XP Potion','⚡',false,state.potions.xp<1||state.active.xp>now)));
 }else if(view==='defence'){
  title='🛡️ Treasury Security';
  const next=TREASURY_DEFENCES[state.defence]||null;
  description='Current defence: **Level '+def.level+' — '+def.name+'**\n'+
   'Chance attackers succeed after hitting the wall: **'+def.chance+'%**\n'+
   'Maximum treasury loss per successful raid: **'+def.loot+'%**, capped at 500 SC.\n\n'+
   (next?'Next: **'+next.name+'** • '+fmt(next.price)+' SC\n'+
    'New success chance: '+next.chance+'% • Maximum loot: '+next.loot+'%':'Maximum defence level reached.');
  buttons.push(new ActionRowBuilder().addComponents(B('upgrade','Upgrade Security','🔒',true,!next)));
 }else if(view==='history'){
  title='📜 Treasury Transaction History';
  const pageSize=10,totalPages=Math.max(1,Math.ceil(state.history.length/pageSize));
  const currentPage=Math.min(totalPages-1,Number.isSafeInteger(page)&&page>=0?page:0);
  const current=state.history.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  description='**Page '+(currentPage+1)+' / '+totalPages+'** • Most recent first • Last '+state.history.length+' saved events\n\n'+
   (current.length?current.map(x=>
    '• <t:'+Math.floor(x.at/1000)+':d> **'+x.kind.replaceAll('_',' ')+'** '+(x.amount>0?'+':'')+
    fmt(x.amount)+' SC'+(x.actorId?' • <@'+x.actorId+'>':'')).join('\n'):
    'No transactions yet. Donations, purchases, payouts, and raids appear here.');
  if(totalPages>1)buttons.push(new ActionRowBuilder().addComponents(
   B('history:'+(currentPage-1),'Previous','⬅️',false,currentPage===0),
   B('history:'+(currentPage+1),'Next','➡️',false,currentPage===totalPages-1)));
 }else if(view==='stats'){
  title='📊 Treasury Statistics';
  description='**Balance:** '+fmt(state.balance)+' / '+fmt(state.capacity)+' SC\n'+
   '**Donations received:** '+fmt(state.donated)+' SC\n'+
   '**Shop & defence spending:** '+fmt(state.spent)+' SC\n'+
   '**Raid winnings received:** '+fmt(state.won)+' SC\n'+
   '**Raid losses and penalties:** '+fmt(state.lost)+' SC\n'+
   '**Defence:** Level '+state.defence+' • '+def.name+'\n'+
   '**Recorded transactions:** '+state.history.length+' most recent events';
  const leaders=Object.entries(state.contributors).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10);
  fields.push({name:'🏅 Top Treasury Contributors',value:leaders.length?
   leaders.map(([id,total],index)=>(index+1)+'. <@'+id+'> — **'+fmt(total)+' SC**').join('\n'):
   'No tracked contributors yet. New donations will appear here.'});
  fields.push({name:'Contributor tracking',value:
   'Leaderboards track donations from this update onwards; older treasury donations remain in the overall total.'});
 }else{
  description='**Balance:** 🪙 **'+fmt(state.balance)+' / '+fmt(state.capacity)+' SC**\n'+
   '**Server level:** determines treasury capacity automatically\n'+
   '**Defence:** '+def.name+' (Level '+def.level+')\n'+
   '**Heists:** '+(state.enabled?'⚔️ Enabled':'🛡️ Disabled')+
   (eligible?' • **1.2× server activity XP**':'')+
   (state.enabled&&!eligible?' • XP bonus paused below 500 SC':'')+'\n'+
   '**Opt-in minimum:** 500 SC\n'+
   (state.shieldUntil>now?'**Raid shield:** '+relative(state.shieldUntil)+'\n':'')+
   (state.changedAt&&now-state.changedAt<TREASURY_TOGGLE_COOLDOWN_MS?
    '**Toggle available:** '+relative(state.changedAt+TREASURY_TOGGLE_COOLDOWN_MS)+'\n':'')+
   '\nMembers may donate. Only the owner can give treasury coins to members or change heist participation.';
  buttons.push(new ActionRowBuilder().addComponents(
   B('donate','Donate Coins','💰',true),
   B('payout','Owner Payout','🎁'),
   B('toggle',state.enabled?'Disable Heists':'Enable Heists','⚔️',false,
    (!state.enabled&&state.balance<TREASURY_MIN_HEIST)||
    (Boolean(state.changedAt)&&now-state.changedAt<TREASURY_TOGGLE_COOLDOWN_MS))));
 }
 const embed=createEmbed({title,description,fields,color:'primary',
  footer:'Beacon • Sand Coins • Shared treasury • All transfers are logged'});
 return {embeds:[embed],components:buttons,allowedMentions:{parse:[]}};
}
export default {
 data:new SlashCommandBuilder().setName('treasury').setDescription('Open the shared Sand Coins treasury dashboard'),
 async execute(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Use this command inside a server.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply();
  const payload=await buildTreasuryPanel(interaction.client,interaction.guildId);
  return interaction.editReply(payload);
 }
};
