import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from './embeds.js';

const GUIDANCE={
  permission:{heading:'Check server permissions',steps:[
    'Open Server Settings → Roles and review Beacon permissions.',
    'Move the Beacon role above the role being assigned.',
    'Review View Channel, Send Messages, Embed Links and channel overrides.']},
  configuration:{heading:'Check feature setup',steps:[
    'Open /dashboard to review the saved feature settings.',
    'Run /diagnose (server managers) to locate permissions or missing channels.',
    'Check the original feature panel and its configured channel.']},
  database:{heading:'Protect saved data',steps:[
    'Do not reset or delete settings while storage is unavailable.',
    'Check /status and ask the Beacon support team about persistent PostgreSQL health.',
    'Retry only once storage is healthy.']},
  discord_api:{heading:'Check Discord access',steps:[
    'If the panel or channel was deleted, reopen its dashboard and verify the configured message.',
    'Check channel permissions for Beacon.',
    'If the interaction expired, run the original command again.']},
  network:{heading:'Connectivity issue',steps:[
    'Allow Discord and Beacon to reconnect.',
    'Retry once using a fresh interaction.',
    'Report recurring errors with the reference shown below.']},
  validation:{heading:'Review command inputs',steps:[
    'Check all IDs, roles and channels belong to this server.',
    'Make sure the selected resources have not been deleted.',
    'Use /help to check required command options.']},
  rate_limit:{heading:'Please try less frequently',steps:[
    'Allow the current cooldown to finish.',
    'Do not repeatedly click the same action.',
    'Try again with a fresh command.']},
  user_input:{heading:'Check your command input',steps:[
    'Review required options and server restrictions.',
    'Fix the selected values, then retry.']},
  unknown:{heading:'Recover from this error',steps:[
    'Reopen the command or dashboard; old component sessions can expire.',
    'Server managers can run /diagnose to check setup.',
    'If it happens again, report the error reference in Beacon Support.']},
};
export function getErrorRescueAdvice(type='unknown',code=null){
  if([50013,50001,50007].includes(Number(code)))return GUIDANCE.permission;
  if([10062,40060,10008].includes(Number(code)))return GUIDANCE.discord_api;
  return GUIDANCE[type]||GUIDANCE.unknown;
}
export function errorRescueComponents(type='unknown',reference=''){
 const safeType=GUIDANCE[type]?type:'unknown';
 const ref=String(reference).replace(/[^A-Za-z0-9_-]/g,'').slice(0,48)||'none';
 return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('error_rescue:'+safeType+':'+ref)
   .setLabel('How to Fix').setEmoji('🛟').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setLabel('Beacon Support').setEmoji('💬').setStyle(ButtonStyle.Link)
   .setURL('https://discord.gg/76N2EM6v6k'),
 )];
}
export function errorRescueEmbed(type='unknown',reference=''){
 const advice=getErrorRescueAdvice(type);
 return createEmbed({
  title:'🛟 Beacon • Error Rescue',
  description:'**'+advice.heading+'**\n\n'+advice.steps.map((step,i)=>(i+1)+'. '+step).join('\n')+
    (reference&&reference!=='none'?'\n\nSupport reference: '+String(reference).slice(0,48):'')+
    '\n\nThis guide does not change or delete saved data.',
  color:'info',
 });
}
