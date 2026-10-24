import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export function buildBeaconServerInfoEmbed(guild, config = {}, owner = null) {
  const channels=[...(guild.channels?.cache?.values?.() || [])];
  const type=key=>channels.filter(channel=>channel.type===key).length;
  const textChannels=type(ChannelType.GuildText)+type(ChannelType.GuildAnnouncement);
  const voiceChannels=type(ChannelType.GuildVoice)+type(ChannelType.GuildStageVoice);
  const forums=type(ChannelType.GuildForum);
  const created=Math.floor(Number(guild.createdTimestamp)/1000);
  const knownOwner=owner?.user?.tag ||
    (guild.ownerId ? '<@'+guild.ownerId+'>' : 'Unavailable');
  const features=new Set(guild.features||[]);
  const highlights=[
    features.has('COMMUNITY')?'Community Server':null,
    features.has('VERIFIED')?'Verified':null,
    features.has('PARTNERED')?'Partnered':null,
    features.has('DISCOVERABLE')?'Discovery Enabled':null,
  ].filter(Boolean);
  return createEmbed({
    title:'🏠 Beacon • '+String(guild.name||'Server').slice(0,90),
    description:'**Community overview**\n'+
      (guild.description?String(guild.description).slice(0,280):'A snapshot of this Discord community.'),
    color:'primary',
    thumbnail:guild.iconURL?.({size:256})||null,
    fields:[
      {name:'👑 Owner',value:knownOwner,inline:true},
      {name:'👥 Members',value:Number(guild.memberCount||0).toLocaleString('en-AU'),inline:true},
      {name:'💎 Server Boosts',value:'Level '+(guild.premiumTier??0)+' • '+(guild.premiumSubscriptionCount??0)+' boosts',inline:true},
      {name:'💬 Text Channels',value:String(textChannels),inline:true},
      {name:'🔊 Voice & Stage',value:String(voiceChannels),inline:true},
      {name:'🧵 Forums',value:String(forums),inline:true},
      {name:'🎭 Roles',value:String(guild.roles?.cache?.size||0),inline:true},
      {name:'🎨 Emojis',value:String(guild.emojis?.cache?.size||0),inline:true},
      {name:'📅 Founded',value:Number.isFinite(created)&&created>0?'<t:'+created+':D> • <t:'+created+':R>':'Unknown',inline:true},
      {name:'🌟 Community Features',value:highlights.join(' • ')||'Standard Discord server',inline:false},
      {name:'🏆 Beacon Progression',value:config.serverProgression?.enabled
        ? '🟢 Enabled • Explore /rank or /progression quests'
        : '⚪ Not enabled • The server owner can opt in using /dashboard',inline:false},
      {name:'🆔 Server ID',value:String(guild.id),inline:false},
    ],
    footer:'Beacon • Community Snapshot',
  });
}

export default {
  data:new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('See your community’s channels, boosts, history and Beacon features')
    .setDMPermission(false)
    .addBooleanOption(option=>option.setName('private')
      .setDescription('Show this server information only to you (default: public)')),
  category:'Utility',
  async execute(interaction,config={}) {
    const privateView=interaction.options?.getBoolean?.('private')===true;
    if(!(await InteractionHelper.safeDefer(interaction,privateView?{flags:MessageFlags.Ephemeral}:{})))return;
    const guild=interaction.guild;
    if(!guild) return InteractionHelper.safeEditReply(interaction,{content:'Run this command in a server.'});
    const owner=await guild.fetchOwner?.().catch(()=>null);
    const embed=buildBeaconServerInfoEmbed(guild,config,owner);
    await InteractionHelper.safeEditReply(interaction,{embeds:[embed],allowedMentions:{parse:[]}});
    logger.debug('Beacon server overview displayed',{guildId:guild.id});
  },
};
