import { MessageFlags } from 'discord.js';
import { getSandServer, getSandCatalogItem, getSandWallet, getSandLimitedStock, SAND_CATALOG } from '../../services/sandCoinsService.js';
import { buildSandShopItemPreview,buildSandShopPanel,normalizeSandShopCategory,normalizeSandShopFilter,selectSandShopItems } from '../../commands/Community/sandcoins.js';
import { buildTreasuryPanel } from '../../commands/Community/treasury.js';
import { logger } from '../../utils/logger.js';

// A global button handler replaces short-lived collectors. Buttons survive
// deployments, work on public shop messages, and are acknowledged immediately.
// Per-message last-click-wins queues prevent stale renders replacing newer ones.
const messageTasks=new Map();
const MAX_MESSAGE_TASKS=200;
function getTaskState(messageId){
 let state=messageTasks.get(messageId);
 if(!state){
  state={revision:0,queue:Promise.resolve()};
  messageTasks.set(messageId,state);
  if(messageTasks.size>MAX_MESSAGE_TASKS)
   messageTasks.delete(messageTasks.keys().next().value);
 }
 return state;
}

export async function handleSandShopButton(interaction,client,args=[],action='preview'){
 if(!interaction.guildId || !interaction.message?.id){
  return interaction.reply({
   content:'Open /sandcoins shop in a server to browse decorations.',
   flags:MessageFlags.Ephemeral,
  }).catch(()=>{});
 }
 const itemId=args.at(-1);
 const filter=action==='filter'||action==='category'?normalizeSandShopFilter(args[1]):
   action==='preview'&&args.length>=3?normalizeSandShopFilter(args[1]):'all';
 // Previous public shop messages have item-only IDs. Preserve support.
 const category=action==='preview' && args.length===1?'all':
  normalizeSandShopCategory(args[0]);
 if((action==='filter'||action==='category')&&filter==='affordable'){
  try{
   // Affordability is per-user. Never edit a shared shop with private wallet data.
   // Category clicks on an already private view should update it in place.
   if(action==='category')await interaction.deferUpdate();
   else await interaction.deferReply({flags:MessageFlags.Ephemeral});
   return interaction.editReply(await buildSandShopPanel(client,interaction.guildId,
    interaction.guild.name,category,filter,interaction.user.id));
  }catch(error){
   logger.warn('Sand shop affordable filter failed',{error:error.message});
   if(interaction.deferred)return interaction.editReply({content:'Could not load affordable items.'}).catch(()=>{});
   return;
  }
 }
 if(action==='preview' && !getSandCatalogItem(itemId)){
  return interaction.reply({
   content:'That decoration is not available to preview. Use /sandcoins shop to refresh.',
   flags:MessageFlags.Ephemeral,
  }).catch(()=>{});
 }
 const state=getTaskState(interaction.message.id);
 const revision=++state.revision; // Mark before any awaiting: newest press wins.
 try{
  // Update acknowledgement happens before database reads or PNG compression.
  // Repeated clicks all receive their own acknowledgement in under 3 seconds.
  await interaction.deferUpdate();
 }catch(error){
  logger.debug('Sand shop button acknowledgement expired',{guildId:interaction.guildId,error:error.message});
  return;
 }
 const render=async()=>{
  if(revision!==state.revision)return;
  try{
   let payload;
   if(action==='treasury'){
    payload=await buildTreasuryPanel(client,interaction.guildId,'shop');
   }else if(action==='back' || action==='category' || action==='filter'){
    payload=await buildSandShopPanel(client,interaction.guildId,interaction.guild.name,
     action==='back'?'all':category,action==='back'?'all':filter);
   }else{
    const server=await getSandServer(client,interaction.guildId);
    if(revision!==state.revision)return;
    let visibleItems=null;
    if(filter!=='all'){
     const all=category==='all'?SAND_CATALOG:SAND_CATALOG.filter(item=>item.type===category);
     const [stocks,wallet]=await Promise.all([
      Promise.all(all.map(item=>getSandLimitedStock(client,item.id))),
      filter==='affordable'?getSandWallet(client,interaction.user.id):Promise.resolve(null),
     ]);
     if(revision!==state.revision)return;
     visibleItems=selectSandShopItems(all,server,stocks,filter,wallet);
    }
    payload=buildSandShopItemPreview(itemId,server,interaction.guild.name,category,filter,visibleItems);
   }
   if(revision!==state.revision)return;
   // Important: edits target the original PUBLIC shop message; no per-click
   // ephemeral messages, no channel spam, and all other buttons remain live.
   await interaction.editReply(payload);
  }catch(error){
   logger.warn('Sand Coins shop preview failed',{guildId:interaction.guildId,error:error.message});
   await interaction.followUp({
    content:'⚠️ This preview could not load. Your coins and inventory have not changed.',
    flags:MessageFlags.Ephemeral,
   }).catch(()=>{});
  }
 };
 // Serialize edits for one message only. Another server/shop stays responsive.
 state.queue=state.queue.catch(()=>{}).then(render);
 await state.queue;
}

export default [
 {name:'sand_shop_preview',async execute(interaction,client,args){
  return handleSandShopButton(interaction,client,args,'preview');
 }},
 {name:'sand_shop_category',async execute(interaction,client,args){
  return handleSandShopButton(interaction,client,args,'category');
 }},
 {name:'sand_shop_back',async execute(interaction,client){
  return handleSandShopButton(interaction,client,[],'back');
 }},
 {name:'sand_shop_filter',async execute(interaction,client,args){
  return handleSandShopButton(interaction,client,args,'filter');
 }},
 {name:'sand_shop_treasury',async execute(interaction,client){
  return handleSandShopButton(interaction,client,[],'treasury');
 }},
];
