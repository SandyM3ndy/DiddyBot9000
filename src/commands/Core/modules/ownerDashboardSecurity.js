import {
  ActionRowBuilder,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,
} from 'discord.js';
import { randomBytes,scryptSync,timingSafeEqual } from 'node:crypto';
import { isPrimaryBotOwner } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

// Authentication happens only in memory. No plaintext passwords, password
// hints, challenge values or session tokens are stored in PostgreSQL/logs.
// The only production verifier is a salted scrypt hash in Railway variables.
const challenges=new Map();
const sessions=new Map();
const failedLogins=new Map();
const CHALLENGE_TTL=2*60_000;
const SESSION_IDLE_TTL=10*60_000;
const SESSION_ABSOLUTE_TTL=30*60_000;
const FAIL_WINDOW=15*60_000;
const MAX_FAILURES=5;

export function hasOwnerDashboardSession(interaction){
 const id=interaction?.user?.id;
 if(!isPrimaryBotOwner(id))return false;
 const session=sessions.get(id);
 if(!session)return false;
 const now=Date.now();
 if(now-session.createdAt>SESSION_ABSOLUTE_TTL||
    now-session.lastSeenAt>SESSION_IDLE_TTL){
  sessions.delete(id);
  return false;
 }
 session.lastSeenAt=now;
 return true;
}
export function revokeOwnerDashboardSession(ownerId){
 sessions.delete(String(ownerId));
 challenges.delete(String(ownerId));
}

export function buildOwnerPasswordChallenge(ownerId){
 if(!isPrimaryBotOwner(ownerId))throw new Error('OWNER_ACCESS_DENIED');
 const nonce=randomBytes(16).toString('hex');
 challenges.set(String(ownerId),{nonce,createdAt:Date.now()});
 return new ModalBuilder()
  .setCustomId('owner_form:unlock:'+ownerId+':'+nonce)
  .setTitle('Beacon • Owner Security Verification')
  .addComponents(new ActionRowBuilder().addComponents(
   new TextInputBuilder().setCustomId('owner_password')
    .setLabel('Owner password (case-sensitive)')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(128),
  ));
}

function verifyPassword(password){
 const encoded=process.env.BEACON_OWNER_PASSWORD_SCRYPT||'';
 const match=/^([a-f\d]{32}):([a-f\d]{64})$/i.exec(encoded);
 if(!match)return false; // Fail CLOSED if the secret is not configured.
 if(typeof password!=='string'||password.length>128)return false;
 const salt=Buffer.from(match[1],'hex');
 const expected=Buffer.from(match[2],'hex');
 const actual=scryptSync(password,salt,expected.length,{
  N:16384,r:8,p:1,maxmem:32*1024*1024,
 });
 return timingSafeEqual(actual,expected);
}

export async function unlockOwnerDashboard(interaction,ownerId,nonce,renderDashboard){
 const id=interaction.user?.id;
 if(!isPrimaryBotOwner(id)||id!==ownerId)
  return InteractionHelper.safeReply(interaction,{
   content:'🔒 Access denied.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
  });
 const now=Date.now();
 const attempt=failedLogins.get(id);
 if(attempt && now-attempt.startedAt<FAIL_WINDOW && attempt.count>=MAX_FAILURES)
  return InteractionHelper.safeReply(interaction,{
   content:'🔒 Too many failed attempts. Owner verification is locked for 15 minutes.',
   flags:MessageFlags.Ephemeral,
  });
 const challenge=challenges.get(id);
 // Destroy the one-time challenge BEFORE reading/comparing input. A replay of
 // a modal submission must not authenticate twice or refresh a session.
 challenges.delete(id);
 if(!challenge||challenge.nonce!==nonce||now-challenge.createdAt>CHALLENGE_TTL)
  return InteractionHelper.safeReply(interaction,{
   content:'🔐 Verification expired. Reopen /bot-owner-dashboard.',
   flags:MessageFlags.Ephemeral,
  });
 const password=interaction.fields?.getTextInputValue('owner_password');
 let accepted=false;
 try{accepted=verifyPassword(password);}
 catch(error){
  logger.error('Beacon owner verification configuration failure',{error:error?.message});
 }
 if(!accepted){
  const current=failedLogins.get(id);
  const fresh=!current||now-current.startedAt>=FAIL_WINDOW;
  const count=(fresh?0:current.count)+1;
  failedLogins.set(id,{count,startedAt:fresh?now:current.startedAt});
  logger.warn('Beacon dashboard password verification failed',{userId:id,attempts:count});
  return InteractionHelper.safeReply(interaction,{
   content:count>=MAX_FAILURES
    ?'🔒 Owner verification locked for 15 minutes.'
    :'🔒 Incorrect password or owner security is not configured. Access denied.',
   flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},
  });
 }
 failedLogins.delete(id);
 sessions.set(id,{createdAt:now,lastSeenAt:now});
 logger.info('Beacon primary owner authenticated to private dashboard',{userId:id});
 return InteractionHelper.safeReply(interaction,{
  ...renderDashboard(interaction.client),flags:MessageFlags.Ephemeral,
 });
}
