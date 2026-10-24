import {
 ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,
} from 'discord.js';
import { createEmbed } from '../embeds.js';
import { hasDangerousPermissions } from '../../services/reactionRoleService.js';
import { REACTION_ROLE_SETUP_BUTTON } from './reactionRoleSetup.js';

export function auditPanelRoles(panel,guild){
 const highest=guild.members?.me?.roles?.highest?.position??-1;
 return (Array.isArray(panel?.roles)?panel.roles:[]).map(id=>{
  const role=guild.roles?.cache?.get(id);
  if(!role)return {id,label:'Missing role '+id,ok:false,reason:'Role was deleted or not cached'};
  if(hasDangerousPermissions(role))return {id,label:role.name,ok:false,reason:'High-privilege role cannot be self-assigned'};
  if(role.position>=highest)return {id,label:role.name,ok:false,reason:'Move Beacon role above this role'};
  if(role.managed)return {id,label:role.name,ok:false,reason:'Managed roles cannot be self-assigned'};
  return {id,label:role.name,ok:true,reason:'Ready'};
 });
}
export function buildReactionRoleStudio(guild,panels=[],selectedId=null){
 const selected=panels.find(p=>p.messageId===selectedId)||panels[0]||null;
 const roles=selected?auditPanelRoles(selected,guild):[];
 const problems=roles.filter(r=>!r.ok);
 const channel=guild.channels?.cache?.get(selected?.channelId);
 const savedTitle=selected?.title||channel?.messages?.cache?.get(selected?.messageId)?.embeds?.[0]?.title;
 const savedDescription=selected?.description||channel?.messages?.cache?.get(selected?.messageId)?.embeds?.[0]?.description;
 const embed=createEmbed({
  title:'🎨 Beacon • Reaction Role Studio',
  description:selected
   ?'**Live design preview (nothing is published by viewing this):**\n\n'
      +'**'+String(savedTitle||'Reaction Roles').slice(0,130)+'**\n'
      +String(savedDescription||'Choose a role below to personalise your community.').slice(0,700)
   :'**Design a role selector for your community.**\n\nCreate a panel to choose its title, description, destination channel and self-assignable roles.',
  color:problems.length?'warning':'primary',
  fields:selected?[
   {name:'📍 Destination',value:channel?'<#'+channel.id+'>':'Channel unavailable / not cached',inline:true},
   {name:'🎭 Selected Roles',value:String(roles.length)+'/25',inline:true},
   {name:'🔎 Security Preflight',value:roles.length===0?'⚠️ No roles configured'
     :problems.length?problems.slice(0,6).map(r=>'⚠️ '+r.label+': '+r.reason).join('\n')
     :'✅ All cached roles pass privilege and hierarchy checks',inline:false},
   {name:'🎨 Role Options Preview',value:roles.length
     ?roles.slice(0,20).map(r=>(r.ok?'✅ ':'⚠️ ')+r.label).join('\n').slice(0,1024)
     :'Add roles using the existing panel editor.',inline:false},
  ]:[
   {name:'🚀 First step',value:'Choose **Create Panel** below. No roles or data are changed until you submit the setup form.'},
  ],
  footer:'Beacon • Preview only • Settings and existing panels remain saved',
 });
 const firstRow=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(REACTION_ROLE_SETUP_BUTTON).setLabel('Create Panel')
    .setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(panels.length>=5),
  new ButtonBuilder().setCustomId('rr_studio_edit:'+(selected?.messageId||'none'))
    .setLabel('Edit Selected').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(!selected),
 );
 const components=[firstRow];
 if(panels.length>1){
  components.push(new ActionRowBuilder().addComponents(
   new StringSelectMenuBuilder().setCustomId('rr_studio_select:'+guild.id)
    .setPlaceholder('🎨 Preview another saved panel')
    .addOptions(panels.slice(0,5).map((panel,i)=>({
      label:'Panel '+(i+1)+' • '+(guild.channels?.cache?.get(panel.channelId)?.name||'uncached'),
      value:panel.messageId,
      description:'Inspect the saved roles and security warnings',
    }))),
  ));
 }
 return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
