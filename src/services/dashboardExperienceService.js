import { getGuildConfig } from './config/guildConfig.js';
import ConfigService from './config/configService.js';

const FEATURES=Object.freeze([
 {id:'ticketSystem',label:'🎫 Tickets'},
 {id:'reactionRoles',label:'🎭 Reaction Roles'},
 {id:'logging',label:'📝 Logging'},
 {id:'welcome',label:'👋 Welcome'},
 {id:'commandAccess',label:'🛠️ Command Access'},
 {id:'joinToCreate',label:'🔊 Join to Create'},
 {id:'serverProgressionEnabled',label:'🏆 Progression'},
 {id:'modRole',label:'🛡️ Moderator Role'},
 {id:'prefix',label:'⌨️ Prefix'},
]);
export const DASHBOARD_FAVOURITES=FEATURES;
const isFeature=id=>FEATURES.some(f=>f.id===id);
const favoritesKey=(guildId,userId)=>'guild:'+guildId+':dashboard:favourites:'+userId;
const undoKey=guildId=>'guild:'+guildId+':dashboard:undo:v1';
const locks=new Map();
async function locked(key,callback){
 const before=locks.get(key)||Promise.resolve();
 let unlock;
 const current=new Promise(resolve=>{unlock=resolve;});
 locks.set(key,current);
 await before.catch(()=>{});
 try{return await callback();}
 finally{unlock();if(locks.get(key)===current)locks.delete(key);}
}
const copy=value=>value===undefined?null:structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function ensureWrite(value){
 if(value===false)throw new Error('Beacon storage refused this change');
}
export async function getDashboardFavourites(client,guildId,userId){
 const stored=await client.db.get(favoritesKey(guildId,userId),[]);
 return Array.isArray(stored)?stored.filter(isFeature).slice(0,4):[];
}
export async function toggleDashboardFavourite(client,guildId,userId,featureId){
 if(!isFeature(featureId))throw new Error('Unknown dashboard feature');
 return locked('favourite:'+guildId+':'+userId,async()=>{
  const current=await getDashboardFavourites(client,guildId,userId);
  const next=current.includes(featureId)?current.filter(x=>x!==featureId):[...current,featureId].slice(-4);
  ensureWrite(await client.db.set(favoritesKey(guildId,userId),next));
  return next;
 });
}
export function formatDashboardFavourites(ids=[]){
 return ids.map(id=>FEATURES.find(x=>x.id===id)?.label).filter(Boolean);
}
export async function getDashboardUndo(client,guildId){
 const record=await client.db.get(undoKey(guildId),null);
 return record?.status==='ready'?record:null;
}
/**
 * The undo record is written as pending before the setting is changed. If
 * a write fails, we NEVER claim that the update was reversible.
 * Undo uses exact-value matching to avoid overwriting subsequent edits.
 */
export async function updateDashboardSettingWithUndo(client,guildId,key,value,adminId){
 return locked('setting:'+guildId,async()=>{
  const config=await getGuildConfig(client,guildId);
  const before=copy(config[key]);
  const after=copy(value);
  if(same(before,after))return {changed:false};
  const record={key,before,after,status:'pending',
    changedBy:adminId,at:new Date().toISOString()};
  ensureWrite(await client.db.set(undoKey(guildId),record));
  try{
   await ConfigService.updateSetting(client,guildId,key,value,adminId);
  }catch(error){
   // A failure may leave the attempted snapshot in storage, but pending
   // snapshots are never offered as undoable history.
   throw error;
  }
  ensureWrite(await client.db.set(undoKey(guildId),{...record,status:'ready'}));
  return {changed:true,record};
 });
}
export async function undoLastDashboardSetting(client,guildId,actorId,{isOwner=false}={}){
 return locked('setting:'+guildId,async()=>{
  const record=await getDashboardUndo(client,guildId);
  if(!record)return {ok:false,reason:'No undoable dashboard change is saved.'};
  if(record.key==='serverProgression'&&!isOwner)
    return {ok:false,reason:'Only the server owner can undo progression settings.'};
  const config=await getGuildConfig(client,guildId);
  if(!same(config[record.key],record.after))
    return {ok:false,reason:'The setting has changed since this snapshot. Undo was cancelled to protect newer work.'};
  // Cancel the candidate before applying the old value, otherwise a concurrent
  // failure could advertise a reversible action that is no longer current.
  ensureWrite(await client.db.set(undoKey(guildId),{...record,status:'restoring'}));
  try{
   await ConfigService.updateSetting(client,guildId,record.key,record.before,actorId);
  }catch(error){
   // Restoring back to ready is safe only if the stored value still equals
   // the edited value; failures must not silently erase any settings.
   const latest=await getGuildConfig(client,guildId);
   if(same(latest[record.key],record.after))
    ensureWrite(await client.db.set(undoKey(guildId),record));
   throw error;
  }
  ensureWrite(await client.db.set(undoKey(guildId),{...record,status:'used',restoredBy:actorId,
   restoredAt:new Date().toISOString()}));
  return {ok:true,key:record.key};
 });
}
