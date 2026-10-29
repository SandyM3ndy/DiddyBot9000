import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { patchGuildConfig } from '../../services/config/guildConfig.js';
import { renderProgressionRankPng } from '../../utils/progressionRankCard.js';
import { getSandServer, getSandAppearance } from '../../services/sandCoinsService.js';
import { createEmbed } from '../../utils/embeds.js';
import { BEACON_IDENTITY } from '../../config/beaconIdentity.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import {
  getServerProgression,
  getGlobalProgressionLeaderboard,
  getLevelProgress,
  getQuestCatalog,
  rerollDailyQuest,
  contributorRanking,
  getFoundingBadge,
  mutateServerProgression,
} from '../../services/serverProgressionService.js';

const PAGE_SIZE = 10;
const VIEWS = [
  { id: 'overview', label: 'Overview', emoji: '📈' },
  { id: 'quests', label: 'Quests', emoji: '🎯' },
  { id: 'leaderboard', label: 'World Rankings', emoji: '🏆' },
  { id: 'milestones', label: 'Rewards', emoji: '🎁' },
  { id: 'weekly', label: 'Weekly', emoji: '📅' },
  { id: 'contributors', label: 'Contributors', emoji: '👥' },
];
const MILESTONES = [
  [2, '📣 Level-up announcements'],
  [5, '🎯 4 daily quests'],
  [10, '⚡ 5% Server XP boost'],
  [15, '🎯 5 daily quests'],
  [20, '💎 Veteran Server milestone'],
  [25, '⚡ 10% Server XP boost'],
  [30, '🎯 6 daily quests'],
  [40, '🏆 Elite Server milestone'],
  [50, '👑 Legendary Server milestone'],
];

function cleanName(value) {
  return String(value || 'Unknown Server').replace(/[*_~<>|]/g, '').slice(0, 70);
}

function meter(percent, blocks = 12) {
  const filled = Math.max(0, Math.min(blocks, Math.round(percent * blocks / 100)));
  return '▰'.repeat(filled) + '▱'.repeat(blocks - filled) + ' ' + percent + '%';
}

function getPosition(entries, guildId) {
  const index = entries.findIndex(entry => entry.guildId === guildId);
  return index < 0 ? null : index + 1;
}

function disabledEmbed() {
  return createEmbed({
    title: '📈 Server Progression Is Paused',
    description: 'Your server owner can enable Beacon progression with the **Enable Progression** button below.\n\n**Sample preview (fictional):**\n🥇 Nova Hub — 12,500 XP\n🥈 The Outpost — 9,200 XP\n🥉 Starter Server — 2,400 XP\n\nThe **World Rankings** tab shows real servers.',
    color: 'warning',
    footer: 'No XP is earned until server progression is enabled.',
  });
}

function overviewEmbed(guild, data, entries, founder = null) {
  const progress = getLevelProgress(data);
  const rank = getPosition(entries, guild.id);
  const finished = data.dailyQuests.filter(quest => quest.completed).length;
  const nextRank = rank && rank > 1 ? entries[rank - 2] : null;
  const needed = nextRank ? Math.max(0, nextRank.xp - data.xp + 1) : null;
  return createEmbed({
    title: '✨ ' + cleanName(guild.name) + ' • ' + BEACON_IDENTITY.surfaces.progression,
    description: '**LEVEL ' + data.level + '**  ·  **' + data.xp.toLocaleString() + ' TOTAL XP**\n' +
      meter(progress.percent) + '\n' +
      progress.progressXp.toLocaleString() + ' / ' + progress.neededXp.toLocaleString() +
      ' XP toward Level ' + (data.level + 1),
    color: 'primary',
    fields: [
      { name: '🌍 World Rank', value: rank ? '#' + rank + ' of ' + entries.length : 'Not ranked yet', inline: true },
      { name: '🎯 Daily Quests', value: finished + ' / ' + data.dailyQuests.length + ' complete', inline: true },
      { name: '🔥 Next Rival', value: needed === null ? 'Top of the board or not ranked' : needed.toLocaleString() + ' XP to pass', inline: false },
      { name: '💬 Eligible Messages', value: data.totalMessages.toLocaleString(), inline: true },
      { name: '🤖 Eligible Commands', value: data.totalCommands.toLocaleString(), inline: true },
      { name: '📌 Your Next Goal', value: data.dailyQuests.find(quest => !quest.completed)?.title || 'All daily quests finished — nice work!', inline: false },
      { name: '🏅 Community Status', value: founder ? `🌟 Founding Community #${founder.number} of 25` : 'Growing Community', inline: false },
    ],
    footer: 'Beacon Network • Each server keeps its own progress',
  });
}

function questsEmbed(guild, data) {
  const quests = data.dailyQuests || [];
  const finished = quests.filter(quest => quest.completed).length;
  const catalogSize = getQuestCatalog().length;
  const fields = quests.map((quest, i) => {
    const progress = Math.min(quest.target, Number(quest.progress) || 0);
    const pct = quest.target ? Math.floor(progress * 100 / quest.target) : 100;
    const difficulty = quest.difficulty || 'Classic';
    return {
      name: (quest.completed ? '✅ ' : '▫️ ') + (i + 1) + '. ' + quest.title + '  •  ' + difficulty,
      value: quest.description + '\n' + meter(pct, 8) + '  (' + progress + '/' + quest.target +
        ')\n🏆 **+' + quest.reward.toLocaleString() + ' XP**' + (quest.completed ? '  ·  Claimed' : ''),
      inline: false,
    };
  });
  return createEmbed({
    title: '🎯 ' + cleanName(guild.name) + ' • Daily Quests',
    description: '**' + finished + '/' + quests.length + ' completed today**\n' +
      'Your server receives a rotating set of community challenges from a pool of **' +
      catalogSize + '** quests. Smaller communities get achievable starter objectives.\n\n' +
      '🟩 Completed quests award Server XP automatically. Eligible contributors also earn global **Sand Coins** (SC) toward this server’s rank-card decorations.',
    color: 'primary',
    fields: fields.length ? fields : [{ name: 'No Quests Yet', value: 'Send a message after enabling progression to begin.' }],
    footer: 'Quests reset daily at 00:00 UTC. Activity must qualify for XP to count.',
  });
}

function leaderboardEmbed(guild, entries, page, founders = []) {
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, pages - 1));
  const rank = getPosition(entries, guild.id);
  const lines = entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
    .map((entry, i) => {
      const position = safePage * PAGE_SIZE + i + 1;
      const medal = ['🥇', '🥈', '🥉'][position - 1] || '🏅';
      const founder=founders.find(item=>item.guildId===entry.guildId);
      const name = (founder ? '🌟 ' : '') + cleanName(entry.guildName);
      const emphasis = entry.guildId === guild.id ? ' ◀ YOUR SERVER' : '';
      return medal + ' **#' + position + ' ' + name + '**' + emphasis +
        '\n      Level ' + entry.level + '  •  **' + entry.xp.toLocaleString() + ' XP**';
    });
  const nextRival = rank && rank > 1 ? entries[rank - 2] : null;
  return createEmbed({
    title: '🌍 ' + BEACON_IDENTITY.surfaces.ranking,
    description: 'Communities ranked by **all-time Server XP**.\n\n' +
      (lines.length ? lines.join('\n\n') : 'No communities have earned XP yet. Be the first!') +
      '\n\n━━━━━━━━━━━━━━━━\n' +
      '**Your position:** ' + (rank ? '#' + rank + ' of ' + entries.length : 'Not yet ranked') +
      (nextRival ? '\n**Next rival:** ' + cleanName(nextRival.guildName) + ' · ' +
        Math.max(0, nextRival.xp - entries[rank - 1].xp + 1).toLocaleString() + ' XP away' : ''),
    color: 'info',
    footer: 'Beacon Network • Page ' + (safePage + 1) + '/' + pages + ' • ' + entries.length +
      ' participating servers • Rankings update when refreshed',
  });
}

function milestonesEmbed(guild, data) {
  const progress = getLevelProgress(data);
  const next = MILESTONES.find(([level]) => level > data.level);
  return createEmbed({
    title: '🎁 ' + cleanName(guild.name) + ' • Level Rewards',
    description: '**Current Level ' + data.level + '**\n' + meter(progress.percent) +
      '\n\n' + MILESTONES.map(([level, reward]) =>
        (data.level >= level ? '✅' : '🔒') + ' **Level ' + level + '** — ' + reward
      ).join('\n'),
    color: 'primary',
    fields: [
      { name: '🎯 Next Milestone', value: next ? 'Level ' + next[0] + ' — ' + next[1] : 'All listed milestones reached!' },
    ],
    footer: 'All-time XP and unlocked rewards are preserved. No seasonal resets.',
  });
}

function weeklyEmbed(guild,data) {
  const w=data.weekly;
  const fields=(w?.quests||[]).map(q=>{
    const pct=Math.floor(100*Math.min(q.progress,q.target)/q.target);
    return {name:(q.completed?'✅ ':'▫️ ')+q.title,
      value:q.description+'\n'+meter(pct,8)+' ('+q.progress+'/'+q.target+')  ·  **+'+q.reward+' XP**'};
  });
  return createEmbed({title:'📅 '+cleanName(guild.name)+' • Weekly Challenges',
    description:'**Week beginning '+(w?.week||'—')+' (UTC)**\n'+
      'Weekly progress and rewards are saved. New challenges roll over every Monday (UTC).',
    color:'primary',fields:fields.length?fields:[{name:'Getting Started',value:'Weekly quests will be assigned once progression starts.'}],
    footer:'Server XP is automatic. Eligible contributors earn global Sand Coins only once per quest.'});
}
function contributorsEmbed(guild,data){
 const weekly=contributorRanking(data,'weekly',10);
 const lifetime=contributorRanking(data,'lifetime',5);
 return createEmbed({title:'👥 '+cleanName(guild.name)+' • Contributors',
  description:'Members who helped with eligible activity. No message content is stored. Use \`/progression privacy\` to hide your name.\n\n'+
    '**This week**\n'+(weekly.length?weekly.map((c,i)=>'#'+(i+1)+' <@'+c.userId+'> — **'+c.actions+'** actions ('+c.messages+' messages, '+c.commands+' commands)').join('\n'):'No contributions yet.')+'\n\n'+
    '**All-time top 5**\n'+(lifetime.length?lifetime.map((c,i)=>'#'+(i+1)+' <@'+c.userId+'> — '+c.actions+' actions').join('\n'):'None recorded.'),
  color:'primary',footer:'Contribution totals persist across daily and weekly resets.'});
}
function buildButtons(interactionId, view, page, entriesCount, expired = false) {
  const nav = new ActionRowBuilder().addComponents(VIEWS.slice(0,4).map(item =>
    new ButtonBuilder()
      .setCustomId('progress_panel:' + interactionId + ':' + item.id)
      .setLabel(item.label)
      .setEmoji(item.emoji)
      .setStyle(item.id === view ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(expired)
  ));
  const more = new ActionRowBuilder().addComponents(VIEWS.slice(4).map(item =>
    new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':' + item.id)
      .setLabel(item.label).setEmoji(item.emoji)
      .setStyle(item.id===view?ButtonStyle.Primary:ButtonStyle.Secondary)
      .setDisabled(expired)
  ));
  more.addComponents(
    new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':reroll')
      .setLabel('Reroll Quest').setEmoji('🎲').setStyle(ButtonStyle.Secondary).setDisabled(expired),
    new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':card')
      .setLabel('Share Rank Card').setEmoji('🖼️').setStyle(ButtonStyle.Secondary).setDisabled(expired),
  );
  const refresh = new ButtonBuilder()
    .setCustomId('progress_panel:' + interactionId + ':refresh')
    .setLabel('Refresh')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(expired);
  const rows = [nav,more,new ActionRowBuilder().addComponents(refresh)];
  if (view === 'leaderboard' && entriesCount > PAGE_SIZE) {
    rows[2].addComponents(
      new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':prev')
        .setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(expired || page === 0),
      new ButtonBuilder().setCustomId('progress_panel:' + interactionId + ':next')
        .setLabel('Next').setStyle(ButtonStyle.Secondary)
        .setDisabled(expired || (page + 1) * PAGE_SIZE >= entriesCount),
    );
  }
  return rows;
}

async function buildPanel(interaction, view, page, expired = false) {
  const [config, data, entries] = await Promise.all([
    getGuildConfig(interaction.client, interaction.guildId),
    getServerProgression(interaction.client, interaction.guildId),
    getGlobalProgressionLeaderboard(interaction.client),
  ]);
  const [founder,founderState]=await Promise.all([
    getFoundingBadge(interaction.client,interaction.guildId),
    interaction.client.db.get('beacon:founders:v1',{entries:[]}),
  ]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1));
  const enabled = config?.serverProgression?.enabled === true;
  const embed = view === 'leaderboard'
    ? leaderboardEmbed(interaction.guild, entries, currentPage,founderState?.entries||[])
    : !enabled ? disabledEmbed()
      : view === 'quests' ? questsEmbed(interaction.guild, data)
        : view === 'milestones' ? milestonesEmbed(interaction.guild, data)
          : view === 'weekly' ? weeklyEmbed(interaction.guild,data)
            : view === 'contributors' ? contributorsEmbed(interaction.guild,data)
              : overviewEmbed(interaction.guild, data, entries,founder);
  const components=buildButtons(interaction.id,view,currentPage,entries.length,expired);
  if(!enabled&&!expired)components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('progress_panel:'+interaction.id+':activate').setLabel('Enable Progression')
      .setEmoji('🚀').setStyle(ButtonStyle.Success)
  ));
  return { embeds: [embed], components, page: currentPage };
}


async function openQuestReroll(button){
 if(button.guild?.ownerId!==button.user.id)
  return button.reply({content:'🔒 Only the server owner can reroll quests.',flags:MessageFlags.Ephemeral});
 // Always acknowledge before a possibly slow database read.
 if(!(await InteractionHelper.safeDefer(button,{flags:MessageFlags.Ephemeral})))return;
 const data=await getServerProgression(button.client,button.guildId);
 const today=new Date().toISOString().slice(0,10);
 if(data.dailyRerollDay===today)
  return InteractionHelper.safeEditReply(button,{content:'🎲 Your free reroll has already been used today. It resets at 00:00 UTC.'});
 const available=data.dailyQuests.filter(q=>!q.completed);
 if(!available.length)
  return InteractionHelper.safeEditReply(button,{content:'✅ No unfinished quests to reroll.'});
 const base='progress_reroll:'+button.id+':';
 const rows=[];
 for(let i=0;i<available.length;i+=5)rows.push(new ActionRowBuilder().addComponents(
  available.slice(i,i+5).map(q=>new ButtonBuilder().setCustomId(base+'select:'+q.id)
   .setLabel(q.title.replace(/^[^\w]+/u,'').slice(0,75)).setStyle(ButtonStyle.Secondary))
 ));
 await InteractionHelper.safeEditReply(button,{
  embeds:[createEmbed({title:'🎲 Choose a Daily Quest to Replace',
   description:'One free reroll per day, per server. This will **discard progress on the selected quest**, and the replacement starts at zero. Rewards already earned are safe.',
   color:'info'})],components:rows
 });
 const msg=await button.fetchReply().catch(()=>null);
 if(!msg?.createMessageComponentCollector)return;
 const collector=msg.createMessageComponentCollector({time:60_000,filter:i=>i.customId.startsWith(base)});
 let selected=null;
 collector.on('collect',async i=>{
  if(i.user.id!==button.user.id) {
   await i.reply({content:'This reroll belongs to the server owner.',flags:MessageFlags.Ephemeral}).catch(()=>{});
   return;
  }
  const action=i.customId.slice(base.length);
  if(action.startsWith('select:')){
   selected=action.slice(7);
   const quest=available.find(q=>q.id===selected);
   if(!quest)return i.update({content:'That quest is no longer available.',embeds:[],components:[]});
   await i.update({embeds:[createEmbed({
    title:'Confirm Quest Reroll?',
    description:'Replace **'+quest.title+'** ('+quest.progress+'/'+quest.target+') with another quest?\n\n⚠️ Progress will reset. You cannot undo this reroll.',
    color:'warning',
   })],components:[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(base+'confirm').setLabel('Yes, reroll').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(base+'cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
   )]}).catch(()=>{});
   return;
  }
  if(action==='cancel') {
   await i.update({content:'Reroll cancelled. Your free reroll is still available.',embeds:[],components:[]}).catch(()=>{});
   collector.stop('cancel');return;
  }
  if(action==='confirm' && selected){
   await i.deferUpdate().catch(()=>{});
   try{
    const r=await rerollDailyQuest(i.client,i.guildId,selected);
    const response=r.result?.changed
     ? '✅ Replaced **'+r.result.previous+'** with **'+r.result.next.title+'**. Your daily reroll has been saved.'
     : '⚠️ '+(r.result?.error||'Unable to reroll this quest.');
    await i.editReply({content:response,embeds:[],components:[]}).catch(()=>{});
   }catch(error){
    await i.editReply({content:'❌ Database save failed. Your reroll was not confirmed. Try again.',embeds:[],components:[]}).catch(()=>{});
   }
   collector.stop('confirmed');
  }
 });
 collector.on('end',async()=>{
  await button.editReply({components:[]}).catch(()=>{});
 });
}

async function sendRankCard(button){
 await button.deferReply();
 const [data,entries,founder,sandInventory]=await Promise.all([
  getServerProgression(button.client,button.guildId),
  getGlobalProgressionLeaderboard(button.client),
  getFoundingBadge(button.client,button.guildId),
  getSandServer(button.client,button.guildId),
 ]);
 const idx=entries.findIndex(e=>e.guildId===button.guildId);
 const png=renderProgressionRankPng({
  name:button.guild.name,rank:idx<0?null:idx+1,
  level:data.level,xp:data.xp,progress:getLevelProgress(data).percent,founder,
  appearance:getSandAppearance(sandInventory),
 });
 await button.editReply({
  content:'🏆 **'+cleanName(button.guild.name)+'** — Beacon Server Rank Card',
  files:[new AttachmentBuilder(png,{name:'beacon-rank.png'})],
  allowedMentions:{parse:[]},
 });
}
async function activateProgression(button){
 if(button.guild.ownerId!==button.user.id)
  return button.reply({content:'🔒 Only the server owner can enable progression.',flags:MessageFlags.Ephemeral});
 await button.deferReply({flags:MessageFlags.Ephemeral});
 try{
  await patchGuildConfig(button.client,button.guildId,{serverProgression:{enabled:true}});
  await mutateServerProgression(button.client,button.guildId,()=>({changed:true}));
  await button.editReply({content:'🚀 **Beacon Progression enabled!** Your daily and weekly challenges are saved. Press Refresh on the progression panel to see them.'});
 }catch(error){
  await button.editReply({content:'❌ Could not enable progression. Please check the database or use /dashboard.'}).catch(()=>{});
 }
}

export default {
  data: new SlashCommandBuilder()
    .setName('progression')
    .setDescription('Explore server progression, daily quests and Beacon world rankings')
    .addSubcommand(sub => sub.setName('overview').setDescription('Open the server progression dashboard'))
    .addSubcommand(sub => sub.setName('quests').setDescription('Explore daily quests and rewards'))
    .addSubcommand(sub => sub.setName('leaderboard').setDescription('Browse global server rankings'))
    .addSubcommand(sub => sub.setName('rank').setDescription('View your server XP and world position'))
    .addSubcommand(sub => sub.setName('milestones').setDescription('Browse level rewards and milestones'))
    .addSubcommand(sub => sub.setName('weekly').setDescription('View the weekly community challenges'))
    .addSubcommand(sub => sub.setName('contributors').setDescription('View the member contribution board'))
    .addSubcommand(sub => sub.setName('privacy').setDescription('Hide or show your contributor ranking')
      .addBooleanOption(opt => opt.setName('hidden').setDescription('Hide your name on the contributor board').setRequired(true))),
  category: 'Community',

  async execute(interaction) {
    if (!interaction.guild) {
      return InteractionHelper.safeReply(interaction, {
        content: 'Open Beacon progression from a Discord server.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if(interaction.options.getSubcommand()==='privacy'){
      if(!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
      const hidden=interaction.options.getBoolean('hidden',true);
      try {
        await mutateServerProgression(interaction.client,interaction.guildId,data=>{
          const next=new Set(data.contributionOptOut||[]);
          if(hidden)next.add(interaction.user.id);else next.delete(interaction.user.id);
          data.contributionOptOut=[...next];
          return {changed:true};
        });
        return InteractionHelper.safeEditReply(interaction,{content:hidden?
          '🔒 You are now hidden from public contributor rankings. Your contribution totals remain saved.':
          '✅ Your name is visible on contributor rankings again.'});
      }catch(error){
        return InteractionHelper.safeEditReply(interaction,{content:'❌ Could not save your preference. Try again.'});
      }
    }
    // Public on purpose: server achievements should be easy for members to share.
    if (!(await InteractionHelper.safeDefer(interaction, {}))) return;
    const subcommand = interaction.options.getSubcommand();
    let view = subcommand === 'rank' ? 'overview' : subcommand;
    let page = 0;
    let payload = await buildPanel(interaction, view, page);
    await InteractionHelper.safeEditReply(interaction, { embeds: payload.embeds, components: payload.components });
    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply?.createMessageComponentCollector) return;

    const prefix = 'progress_panel:' + interaction.id + ':';
    const collector = reply.createMessageComponentCollector({
      time: 5 * 60 * 1000,
      filter: button => button.customId.startsWith(prefix),
    });
    collector.on('collect', async button => {
      if (button.user.id !== interaction.user.id) {
        await button.reply({ content: 'Use /progression to open your own leaderboard panel.',
          flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      const action = button.customId.slice(prefix.length);
      if(action==='reroll')return openQuestReroll(button).catch(async()=>{
        const content='⚠️ Could not load the reroll. Your saved quests remain unchanged.';
        if(button.deferred||button.replied)
          await button.editReply({content,embeds:[],components:[]}).catch(()=>{});
        else await button.reply({content,flags:MessageFlags.Ephemeral}).catch(()=>{});
      });
      if(action==='card')return sendRankCard(button).catch(async()=> {
        if(button.deferred || button.replied)await button.editReply({content:'⚠️ Could not generate a rank card right now.'}).catch(()=>{});
        else await button.reply({content:'⚠️ Could not generate a rank card.',flags:MessageFlags.Ephemeral}).catch(()=>{});
      });
      if(action==='activate')return activateProgression(button);
      const acknowledged = await button.deferUpdate().then(() => true).catch(() => false);
      if (!acknowledged) return;
      if (action === 'next') page += 1;
      else if (action === 'prev') page = Math.max(0, page - 1);
      else if (action !== 'refresh' && VIEWS.some(item => item.id === action)) {
        view = action;
        page = 0;
      }
      try {
        payload = await buildPanel(interaction, view, page);
        page = payload.page;
        await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      } catch {
        // A failed refresh should not destroy the panel or hide its controls.
        await button.followUp({
          content:'⚠️ Beacon could not refresh this view. Your saved progress is unchanged; try Refresh again.',
          flags:MessageFlags.Ephemeral,
        }).catch(()=>{});
      }
    });
    collector.on('end', async () => {
      try {
        const disabled = buildButtons(interaction.id, view, page,
          view === 'leaderboard' ? 11 : 0, true);
        await interaction.editReply({ components: disabled }).catch(() => {});
      } catch { /* The source message may have been deleted. */ }
    });
  },
};
