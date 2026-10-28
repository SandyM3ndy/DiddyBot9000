import {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder, MessageFlags, ComponentType,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getModerationCases } from '../../utils/moderation.js';
import { getCase, normalizeCase, updateCaseReview } from '../../services/moderationCaseManager.js';
import { logger } from '../../utils/logger.js';
import warningRecordsCommand from './warnings.js';
import { memberHasConfiguredModeratorRole } from '../../utils/permissionGuard.js';

const PAGE_SIZE = 5;
const clean = (value, max = 500) => String(value || 'Not specified').replaceAll('@', '@\u200b').slice(0, max);
const timestamp = value => {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? '<t:' + Math.floor(ms / 1000) + ':f>' : 'Unknown';
};
const canReview = interaction => Boolean(
  interaction.guild?.ownerId === interaction.user.id ||
  interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
  interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
);

export function buildCaseDetail(case_) {
  const item = normalizeCase(case_);
  const notes = item.review.notes.slice(-3).reverse().map(n => '• ' + clean(n.text, 230) +
    ' — <@' + n.authorId + '>').join('\n');
  const evidence = item.review.evidence.slice(-3).reverse().map(e =>
    '• [Evidence link](' + e.url.replace(/\)/g, '%29') + ') added by <@' + e.authorId + '>').join('\n');
  return createEmbed({
    title: '⚖️ Beacon • Case #' + item.caseId,
    description: '**' + clean(item.action,100) + '**\n' + clean(item.reason, 650),
    color: item.review.status === 'resolved' ? 'success' :
      item.review.status === 'appealed' ? 'warning' : 'primary',
    fields: [
      { name:'📋 Review Status',value:item.review.status.toUpperCase(),inline:true },
      { name:'👤 Target',value: clean(item.target,150),inline:true },
      { name:'🛡️ Moderator',value:clean(item.executor,150),inline:true },
      { name:'📅 Created',value:timestamp(item.createdAt),inline:true },
      { name:'✏️ Updated',value:item.review.updatedAt ? timestamp(item.review.updatedAt) : 'No review changes',inline:true },
      { name:'🔎 Source',value:clean(item.metadata?.source || 'Moderation',75),inline:true },
      { name:'📝 Staff Notes (' + item.review.notes.length + ')',value:notes || 'No review notes',inline:false },
      { name:'📎 Evidence Links (' + item.review.evidence.length + ')',value:evidence || 'No evidence links',inline:false },
    ],
    footer: 'Beacon • Private case record • Use /cases status, note or evidence to update',
  });
}

export function buildCaseListPage(cases, guildName, page = 0) {
  const last = Math.max(0, Math.ceil(cases.length / PAGE_SIZE) - 1);
  const current = Math.max(0, Math.min(last, page));
  const slice = cases.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const fields = slice.map(c => ({
    name: 'Case #' + c.caseId + ' • ' + clean(c.action,80),
    value: '**' + normalizeCase(c).review.status.toUpperCase() + '** • ' +
      clean(c.target,100) + '\n' + clean(c.reason,220) + '\n' + timestamp(c.createdAt),
    inline: false,
  }));
  const embed = createEmbed({
    title: '⚖️ Beacon • Moderation Case Manager',
    description: '**' + clean(guildName, 90) + '**\n' + cases.length +
      ' cases • Page ' + (current + 1) + '/' + (last + 1) +
      '\nBrowse incidents, then select a case to inspect its review history.',
    color: 'primary',
    fields: fields.length ? fields : [{name:'No cases',value:'No records match this search.'}],
    footer: 'Beacon • Staff records • Updates require moderation permissions',
  });
  const controls = [];
  if (slice.length) controls.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('cases_pick')
      .setPlaceholder('Choose a case to inspect...')
      .addOptions(slice.map(c => ({
        label: 'Case #' + c.caseId + ' • ' + clean(c.action, 55),
        value: String(c.caseId),
      }))),
  ));
  controls.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cases_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
    new ButtonBuilder().setCustomId('cases_page').setLabel((current + 1) + '/' + (last + 1)).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('cases_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current === last),
    new ButtonBuilder().setCustomId('cases_refresh').setLabel('Refresh').setStyle(ButtonStyle.Primary),
  ));
  return { embeds:[embed], components:controls, page:current };
}

export default {
  category:'Moderation',
  data: new SlashCommandBuilder().setName('cases')
    .setDescription('Private moderation case manager with review notes and evidence')
    .setDMPermission(false)
    // Warnings are for moderators, even if they lack View Audit Log.
    // Enforce each action's staff permission in the handler.
    .setDefaultMemberPermissions(null)
    .addSubcommand(sub => sub.setName('list').setDescription('Browse recent moderation cases')
      .addUserOption(o => o.setName('user').setDescription('Filter by target user'))
      .addStringOption(o => o.setName('type').setDescription('Filter by action')
        .addChoices(
          {name:'All',value:'all'},{name:'Bans',value:'Member Banned'},
          {name:'Kicks',value:'Member Kicked'},{name:'Warnings',value:'User Warned'},
          {name:'Timeouts',value:'Member Timed Out'},
        )))
    .addSubcommand(sub => sub.setName('view').setDescription('View a moderation case and its review history')
      .addIntegerOption(o => o.setName('id').setDescription('Case number').setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName('status').setDescription('Set case review status (moderation staff)')
      .addIntegerOption(o => o.setName('id').setDescription('Case number').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('state').setDescription('Review state').setRequired(true).addChoices(
        {name:'Open',value:'open'},{name:'Under Review',value:'reviewing'},
        {name:'Resolved',value:'resolved'},{name:'Appealed',value:'appealed'},
      )))
    .addSubcommand(sub => sub.setName('note').setDescription('Attach a private staff review note')
      .addIntegerOption(o => o.setName('id').setDescription('Case number').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('text').setDescription('Private note (1–900 characters)').setMaxLength(900).setRequired(true)))
    .addSubcommand(sub => sub.setName('evidence').setDescription('Attach an HTTPS evidence link to a case')
      .addIntegerOption(o => o.setName('id').setDescription('Case number').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('url').setDescription('Secure evidence URL').setMaxLength(600).setRequired(true)))
    .addSubcommand(sub => sub.setName('warnings').setDescription('View a member’s recorded warnings (moderation staff)')
      .addUserOption(o=>o.setName('target').setDescription('Member to check').setRequired(true)))
    .addSubcommand(sub => sub.setName('warn').setDescription('Issue a warning to a server member')
      .addUserOption(o=>o.setName('target').setDescription('Member to warn').setRequired(true))
      .addStringOption(o=>o.setName('reason').setDescription('Reason for warning').setRequired(true).setMaxLength(500))),

  async execute(interaction, config, client) {
    const action=interaction.options.getSubcommand();
    if (['warnings','warn'].includes(action)) {
      const staff=interaction.guild?.ownerId===interaction.user.id ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        memberHasConfiguredModeratorRole(interaction.member,config);
      if(!staff)return InteractionHelper.safeReply(interaction,{
        content:'Moderate Members permission is required to issue or inspect warnings.',
        flags:MessageFlags.Ephemeral,
      });
      return warningRecordsCommand.execute(interaction,config,client||interaction.client);
    }
    if (!interaction.guildId) return InteractionHelper.safeReply(interaction, {
      content:'Case records are available only in a server.',flags:MessageFlags.Ephemeral,
    });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ViewAuditLog) &&
        !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
        interaction.guild?.ownerId !== interaction.user.id) {
      return InteractionHelper.safeReply(interaction, {
        content:'View Audit Log permission is required to access case records.',flags:MessageFlags.Ephemeral,
      });
    }
    if (!(await InteractionHelper.safeDefer(interaction,{flags:MessageFlags.Ephemeral})))return;
    try {
      if (['status','note','evidence'].includes(action)) {
        if (!canReview(interaction)) return InteractionHelper.safeEditReply(interaction, {
          content:'Only moderators with Moderate Members or Manage Server may edit case records.',
        });
        const caseId = interaction.options.getInteger('id',true);
        const value = action === 'status' ? interaction.options.getString('state',true)
          : action === 'note' ? interaction.options.getString('text',true)
          : interaction.options.getString('url',true);
        const updated = await updateCaseReview({
          client: client || interaction.client, guild: interaction.guild,
          caseId, editorId: interaction.user.id, operation:action,value,
        });
        return InteractionHelper.safeEditReply(interaction,{
          content:'✅ Case #' + caseId + ' review record updated. This does **not** modify an actual Discord punishment.',
          embeds:[buildCaseDetail(updated)],allowedMentions:{parse:[]},
        });
      }
      if (action === 'view') {
        const item = await getCase(interaction.guildId,interaction.options.getInteger('id',true));
        return InteractionHelper.safeEditReply(interaction,{
          embeds: item ? [buildCaseDetail(item)] : [createEmbed({
            title:'No Case Found',description:'That case number does not exist in this server.',color:'warning',
          })],
          allowedMentions:{parse:[]},
        });
      }
      const filter = interaction.options.getString('type') || 'all';
      const user = interaction.options.getUser('user');
      const load = () => getModerationCases(interaction.guildId,{
        limit:1000, userId:user?.id, action:filter === 'all' ? undefined : filter,
      });
      let records = await load(), page = 0;
      const show = () => buildCaseListPage(records, interaction.guild.name,page);
      const render = show();
      const ok = await InteractionHelper.safeEditReply(interaction,{
        embeds:render.embeds,components:render.components,allowedMentions:{parse:[]},
      });
      if (!ok)return;
      const message = await interaction.fetchReply().catch(()=>null);
      if(!message?.createMessageComponentCollector)return;
      const collector = message.createMessageComponentCollector({
        time:180_000,filter:i=>['cases_pick','cases_prev','cases_next','cases_refresh','cases_back'].includes(i.customId),
      });
      collector.on('collect',async i=>{
        try {
          if(i.user.id!==interaction.user.id){
            await i.reply({content:'Open /cases list for your own private session.',flags:MessageFlags.Ephemeral});
            return;
          }
          await i.deferUpdate();
          if(i.customId==='cases_pick'){
            const item=await getCase(interaction.guildId,i.values[0]);
            if(item){
              await i.editReply({embeds:[buildCaseDetail(item)],
                components:[new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId('cases_back').setLabel('Back to Cases').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                )],allowedMentions:{parse:[]}});
              return;
            }
          }
          if(i.customId==='cases_refresh')records=await load();
          if(i.customId==='cases_next')page++;
          if(i.customId==='cases_prev')page--;
          const view=show();
          page=view.page;
          await i.editReply({embeds:view.embeds,components:view.components,allowedMentions:{parse:[]}});
        }catch(error){
          logger.warn('Case browser failed',{guildId:interaction.guildId,error:error?.message});
          if(i.deferred || i.replied)await i.followUp({content:'⚠️ Could not update this case view.',flags:MessageFlags.Ephemeral}).catch(()=>{});
        }
      });
      collector.on('end',()=>void InteractionHelper.safeEditReply(interaction,{
        embeds:[createEmbed({title:'⌛ Case Browser Closed',description:'Use /cases list to start a new private review session.',color:'primary'})],
        components:[],
      }));
    }catch(error){
      logger.error('Moderation case manager failed',{guildId:interaction.guildId,error:error?.message});
      return InteractionHelper.safeEditReply(interaction,{
        content:'⚠️ ' + (error?.message || 'Unable to load case records. Try again later.'),
      });
    }
  },
};
