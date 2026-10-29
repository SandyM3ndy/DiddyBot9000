import {
 MessageFlags,ModalBuilder,ActionRowBuilder,TextInputBuilder,TextInputStyle,
} from 'discord.js';
import { isPrimaryBotOwner } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import {
 OWNER_ACTIONS,OWNER_FORM_FIELDS,buildOwnerDashboard,buildOwnerGuildList,
 buildOwnerRestartConfirmation,
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
const locked=i=>!isPrimaryBotOwner(i.user?.id);
const forbidden=i=>InteractionHelper.safeReply(i,{
 content:'🔒 This is a private Bot Owner Dashboard. Only the primary Beacon owner can use it.',
 flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
});
function createForm(action,ownerId){
 const descriptor=OWNER_ACTIONS[action],fields=OWNER_FORM_FIELDS[action];
 if(!descriptor||!fields)return null;
 const modal=new ModalBuilder().setCustomId('owner_form:'+action+':'+ownerId)
  .setTitle(descriptor.label.slice(0,45));
 for(const field of fields){
  const input=new TextInputBuilder()
   .setCustomId(field.id).setLabel(field.label.slice(0,45))
   .setStyle(field.multiline?TextInputStyle.Paragraph:TextInputStyle.Short)
   .setMaxLength(field.max).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
 }
 return modal;
}
export async function selectOwnerAction(i,action){
 if(locked(i))return forbidden(i);
 if(!Object.hasOwn(OWNER_ACTIONS,action))
  return InteractionHelper.safeReply(i,{content:'Unknown owner action. Reopen /ownerstats.',
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
 if(['home','progression','announcements','maintenance'].includes(action))
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
 if(locked(i)||args[1]!==i.user.id)return forbidden(i);
 const action=args[0],form=OWNER_FORM_FIELDS[action],operation=OWNER_OPERATIONS[action];
 if(!form||!operation)return InteractionHelper.safeReply(i,{
  content:'Unknown owner operation. Open /ownerstats again.',flags:MessageFlags.Ephemeral});
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
  return await operation.execute(withOwnerActionOptions(i,values));
 }catch(error){
  logger.warn('Owner dashboard action failed',{action,error:error?.message});
  return InteractionHelper.safeReply(i,{
   content:'⚠️ Owner operation was not completed: '+String(error?.message||'Unknown error').slice(0,280),
   flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
  });
 }
}
