import {
 MessageFlags,ModalBuilder,ActionRowBuilder,TextInputBuilder,TextInputStyle,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { isPrimaryBotOwner } from '../../../config/bot.js';
import { hasOwnerDashboardSession,unlockOwnerDashboard } from './ownerDashboardSecurity.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import {
 OWNER_ACTIONS,OWNER_FORM_FIELDS,buildOwnerDashboard,buildOwnerGuildList,
 buildOwnerRestartConfirmation,buildOwnerAnnouncementPreview,
} from './ownerDashboardUi.js';
import announcement from './ownerActions/announcement.js';
import giveexp from './ownerActions/giveexp.js';
import removeexp from './ownerActions/removeexp.js';
import exclude from './ownerActions/removeleaderboard.js';
import restore from './ownerActions/restoreleaderboard.js';
import backup from './ownerActions/progressionexport.js';
import restart from './ownerActions/restart.js';

export const OWNER_OPERATIONS=Object.freeze({
 announcement,giveexp,removeexp,exclude,restore,export:backup,restart,
});
// One draft per owner, never persisted or broadcast by modal submission alone.
const announcementDrafts=new Map();
const DRAFT_TTL_MS=5*60*1000;
const locked=i=>!isPrimaryBotOwner(i.user?.id)||!hasOwnerDashboardSession(i);
const forbidden=i=>InteractionHelper.safeReply(i,{
 content:isPrimaryBotOwner(i.user?.id)
  ?'🔐 Private Bot Owner Dashboard locked. Run /bot-owner-dashboard and enter your password.'
  :'🔒 Private Bot Owner Dashboard: access denied.',
 flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
});
function createForm(action,ownerId,defaults={}){
 const descriptor=OWNER_ACTIONS[action],fields=OWNER_FORM_FIELDS[action];
 if(!descriptor||!fields)return null;
 const modal=new ModalBuilder().setCustomId('owner_form:'+action+':'+ownerId)
  .setTitle(descriptor.label.slice(0,45));
 for(const field of fields){
  const input=new TextInputBuilder()
   .setCustomId(field.id).setLabel(field.label.slice(0,45))
   .setStyle(field.multiline?TextInputStyle.Paragraph:TextInputStyle.Short)
   .setMaxLength(field.max).setRequired(true);
  if(typeof defaults[field.id]==='string')input.setValue(defaults[field.id]);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
 }
 return modal;
}
export async function selectOwnerAction(i,action){
 if(locked(i))return forbidden(i);
 if(!Object.hasOwn(OWNER_ACTIONS,action))
  return InteractionHelper.safeReply(i,{content:'Unknown owner action. Reopen /bot-owner-dashboard.',
   flags:MessageFlags.Ephemeral});
 if(OWNER_FORM_FIELDS[action])return i.showModal(createForm(action,i.user.id));
 if(action==='guilds')return i.update(buildOwnerGuildList(i.client));
 if(action==='restart')return i.update(buildOwnerRestartConfirmation());
 if(action==='export')return OWNER_OPERATIONS.export.execute(i);
}
export async function ownerDashboardSelect(i){
 if(locked(i))return forbidden(i);
 return selectOwnerAction(i,i.values?.[0]);
}
export async function ownerDashboardButton(i,args=[]){
 if(locked(i))return forbidden(i);
 const action=args[0];
 if(['announce-confirm','announce-edit','announce-cancel'].includes(action)){
  const ownerId=args[1],token=args[2],draft=announcementDrafts.get(i.user.id);
  if(ownerId!==i.user.id || !draft || draft.token!==token ||
      Date.now()-draft.createdAt>DRAFT_TTL_MS){
   // Do not allow an old modal preview to send after a newer draft replaced it.
   if(draft && Date.now()-draft.createdAt>DRAFT_TTL_MS)
    announcementDrafts.delete(i.user.id);
   return i.update(buildOwnerDashboard(i.client,'announcements',
    '⚠️ This announcement review expired or was replaced. Compose a new announcement.'));
  }
  // Invalidate synchronously before any await so two clicks cannot send twice.
  announcementDrafts.delete(i.user.id);
  if(action==='announce-cancel')
   return i.update(buildOwnerDashboard(i.client,'announcements','Announcement discarded. Nothing was sent.'));
  if(action==='announce-edit')
   return i.showModal(createForm('announcement',i.user.id,draft));
  await i.update({
   content:'📡 Sending your confirmed Beacon announcement…',embeds:[],components:[],
   allowedMentions:{parse:[]},
  });
  try{
   logger.info('Beacon network announcement confirmed',{ownerId:i.user.id});
   return await OWNER_OPERATIONS.announcement.execute(withOwnerActionOptions(i,draft));
  }catch(error){
   logger.error('Confirmed Beacon announcement failed',{message:error?.message});
   return InteractionHelper.safeEditReply(i,{
    content:'⚠️ Announcement delivery failed. Check Railway logs before sending again.',
    embeds:[],components:[],allowedMentions:{parse:[]},
   });
  }
 }
 if(action==='open')return selectOwnerAction(i,args[1]);
 if(['home','progression','announcements','health','maintenance'].includes(action))
  return i.update(buildOwnerDashboard(i.client,action));
 if(action==='guilds'){
  const number=Number(args[1]||0);
  return i.update(buildOwnerGuildList(i.client,Number.isInteger(number)?number:0));
 }
 if(action==='restart-confirm')return OWNER_OPERATIONS.restart.execute(i);
 return InteractionHelper.safeReply(i,{content:'Unknown owner dashboard button.',
  flags:MessageFlags.Ephemeral});
}
// Discord sends modal submissions as a different interaction. Adapt only the
// validated option interface, preserving its real reply/defer lifecycle.
// Never fake, skip or persist a second bot-owner login/permission check.
export function withOwnerActionOptions(interaction,fields){
 const options={
  getString(name,required=false){
   const value=fields[name];
   if(required&&typeof value!=='string')throw new Error('Missing option: '+name);
   return value??null;
  },
  getInteger(name,required=false){
   if(!(name in fields))return required?NaN:null;
   const text=String(fields[name]).trim();
   return /^\d{1,10}$/.test(text)?Number(text):NaN;
  },
 };
 return new Proxy(interaction,{
  get(target,prop){
   if(prop==='options')return options;
   const value=Reflect.get(target,prop,target);
   return typeof value==='function'?value.bind(target):value;
  },
 });
}
export async function ownerDashboardModal(i,args=[]){
 // Unlock is the ONLY modal action allowed without an authenticated session.
 if(args[0]==='unlock')return unlockOwnerDashboard(i,args[1],args[2],buildOwnerDashboard);
 if(locked(i)||args[1]!==i.user.id)return forbidden(i);
 const action=args[0],form=OWNER_FORM_FIELDS[action],operation=OWNER_OPERATIONS[action];
 if(!form||!operation)return InteractionHelper.safeReply(i,{
  content:'Unknown owner operation. Open /bot-owner-dashboard again.',flags:MessageFlags.Ephemeral});
 const values={};
 try{
  for(const item of form){
   const value=i.fields.getTextInputValue(item.id).trim();
   if(!value||value.length>item.max)throw new Error('Incomplete or too long: '+item.id);
   values[item.id]=value;
  }
  if(values.server_id&&!/^\d{17,20}$/.test(values.server_id))
   throw new Error('Enter a valid 17–20 digit Discord server ID.');
  if(values.amount){
   const n=Number(values.amount);
   if(!/^\d+$/.test(values.amount)||!Number.isSafeInteger(n)||n<1||n>1_000_000_000)
    throw new Error('XP amount must be between 1 and 1,000,000,000.');
  }
  if(values.message&&values.message.length>1800)
   throw new Error('Announcements must be at most 1,800 characters.');
  if(action==='announcement'){
   // Preview is always private; the real delivery requires a separate button.
   const token=randomBytes(8).toString('hex');
   announcementDrafts.set(i.user.id,{...values,token,createdAt:Date.now()});
   return InteractionHelper.safeReply(i,{
    ...buildOwnerAnnouncementPreview({...values,ownerId:i.user.id,token}),
    flags:MessageFlags.Ephemeral,
   });
  }
  return await operation.execute(withOwnerActionOptions(i,values));
 }catch(error){
  logger.warn('Owner dashboard action failed',{action,error:error?.message});
  return InteractionHelper.safeReply(i,{
   content:'⚠️ Owner operation was not completed: '+String(error?.message||'Unknown error').slice(0,280),
   flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
  });
 }
}
