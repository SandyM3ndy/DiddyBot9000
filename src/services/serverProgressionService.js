import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { grantQuestSandCoins } from './sandCoinsService.js';
import { recordQuestContribution, queueSharedSandRewards } from './sandQuestRewards.js';

const KEY_PREFIX = 'guild:';
const KEY_SUFFIX = ':progression';
const DAY_MS = 24 * 60 * 60 * 1000;
const activityBuckets = new Map();
const commandBuckets = new Map();
const guildLocks = new Map();
const postgresAdvisorySlots = new WeakMap();

// Advisory locks each occupy a pooled connection while a data read/write
// needs another one. Bound concurrent holders to avoid connection starvation.
async function reserveAdvisorySlot(pool) {
  const max = Number(pool?.options?.max || 20);
  if (max <= 1) {
    throw new Error('Beacon progression requires at least two PostgreSQL connections for safe concurrent writes.');
  }
  let state = postgresAdvisorySlots.get(pool);
  if (!state) {
    state = { active: 0, queue: [] };
    postgresAdvisorySlots.set(pool, state);
  }
  const capacity = Math.max(1, Math.min(4, Math.floor(max / 2)));
  if (state.active >= capacity) {
    // A holder hands its slot directly to the next waiter. Keeping active
    // reserved prevents new arrivals overtaking queued work between ticks.
    await new Promise(resolve => state.queue.push(resolve));
  } else {
    state.active += 1;
  }
  return () => {
    const next = state.queue.shift();
    if (next) next();
    else state.active -= 1;
  };
}

// Keep inactive per-user activity buckets from accumulating forever.
const activityCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, messages] of activityBuckets) {
    const active = messages.filter(message => message.at > cutoff);
    if (active.length) activityBuckets.set(key, active);
    else activityBuckets.delete(key);
  }
  for (const [key, timestamp] of commandBuckets) {
    if (timestamp < cutoff) commandBuckets.delete(key);
  }
}, 5 * 60_000);
activityCleanupTimer.unref?.();

const QUEST_POOL = [
  {
    "id": "spark",
    "title": "✨ First Sparks",
    "description": "Send 3 eligible messages.",
    "metric": "messages",
    "target": 3,
    "reward": 35,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "first_words",
    "title": "💬 First Words",
    "description": "Send 10 eligible messages.",
    "metric": "messages",
    "target": 10,
    "reward": 80,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "campfire",
    "title": "🔥 Campfire Chat",
    "description": "Send 25 eligible messages.",
    "metric": "messages",
    "target": 25,
    "reward": 155,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "chat_crew",
    "title": "🎉 Chat Crew",
    "description": "Send 50 eligible messages.",
    "metric": "messages",
    "target": 50,
    "reward": 265,
    "minMembers": 10,
    "difficulty": "Medium"
  },
  {
    "id": "chatterbox",
    "title": "🗣️ Chatterbox",
    "description": "Send 100 eligible messages across the server.",
    "metric": "messages",
    "target": 100,
    "reward": 350,
    "minMembers": 25,
    "difficulty": "Hard"
  },
  {
    "id": "busy_server",
    "title": "🔥 Busy Server",
    "description": "Send 250 eligible messages across the server.",
    "metric": "messages",
    "target": 250,
    "reward": 650,
    "minMembers": 100,
    "difficulty": "Hard"
  },
  {
    "id": "bot_checkin",
    "title": "🤖 Bot Check-In",
    "description": "Use 2 eligible Beacon commands.",
    "metric": "commands",
    "target": 2,
    "reward": 50,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "bot_explorer",
    "title": "🔍 Bot Explorer",
    "description": "Use 5 eligible Beacon commands.",
    "metric": "commands",
    "target": 5,
    "reward": 110,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "command_crew",
    "title": "⚙️ Command Crew",
    "description": "Use 10 eligible Beacon commands.",
    "metric": "commands",
    "target": 10,
    "reward": 190,
    "minMembers": 5,
    "difficulty": "Medium"
  },
  {
    "id": "command_centre",
    "title": "🤖 Command Centre",
    "description": "Use 25 eligible Beacon commands.",
    "metric": "commands",
    "target": 25,
    "reward": 400,
    "minMembers": 25,
    "difficulty": "Hard"
  },
  {
    "id": "command_champions",
    "title": "🎛️ Command Champions",
    "description": "Use 40 eligible Beacon commands.",
    "metric": "commands",
    "target": 40,
    "reward": 650,
    "minMembers": 75,
    "difficulty": "Hard"
  },
  {
    "id": "home_base",
    "title": "🏠 Home Base",
    "description": "Be active in 1 text channel.",
    "metric": "channels",
    "target": 1,
    "reward": 35,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "two_corners",
    "title": "🚪 Two Corners",
    "description": "Chat in 2 different channels.",
    "metric": "channels",
    "target": 2,
    "reward": 100,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "three_hangouts",
    "title": "🧭 Three Hangouts",
    "description": "Chat in 3 different channels.",
    "metric": "channels",
    "target": 3,
    "reward": 155,
    "minMembers": 5,
    "difficulty": "Medium"
  },
  {
    "id": "four_corners",
    "title": "🗺️ Four Corners",
    "description": "Chat in 4 different channels.",
    "metric": "channels",
    "target": 4,
    "reward": 215,
    "minMembers": 10,
    "difficulty": "Medium"
  },
  {
    "id": "channel_hopper",
    "title": "🚪 Channel Hopper",
    "description": "Have conversations in 5 different channels.",
    "metric": "channels",
    "target": 5,
    "reward": 300,
    "minMembers": 25,
    "difficulty": "Hard"
  },
  {
    "id": "solo_signal",
    "title": "📡 Solo Signal",
    "description": "Have 1 member participate in chat.",
    "metric": "uniqueMembers",
    "target": 1,
    "reward": 40,
    "minMembers": 1,
    "difficulty": "Starter"
  },
  {
    "id": "dynamic_duo",
    "title": "🤝 Dynamic Duo",
    "description": "Have 2 different members participate in chat.",
    "metric": "uniqueMembers",
    "target": 2,
    "reward": 105,
    "minMembers": 2,
    "difficulty": "Starter"
  },
  {
    "id": "small_circle",
    "title": "🫂 Small Circle",
    "description": "Have 3 different members participate in chat.",
    "metric": "uniqueMembers",
    "target": 3,
    "reward": 165,
    "minMembers": 4,
    "difficulty": "Medium"
  },
  {
    "id": "five_friends",
    "title": "🌟 Five Friends",
    "description": "Have 5 different members participate in chat.",
    "metric": "uniqueMembers",
    "target": 5,
    "reward": 265,
    "minMembers": 10,
    "difficulty": "Medium"
  },
  {
    "id": "social_club",
    "title": "🎈 Social Club",
    "description": "Have 8 different members participate in chat.",
    "metric": "uniqueMembers",
    "target": 8,
    "reward": 350,
    "minMembers": 20,
    "difficulty": "Medium"
  },
  {
    "id": "social_butterfly",
    "title": "🦋 Social Butterfly",
    "description": "Get 15 different members chatting today.",
    "metric": "uniqueMembers",
    "target": 15,
    "reward": 450,
    "minMembers": 40,
    "difficulty": "Hard"
  },
  {
    "id": "fresh_face",
    "title": "👋 Fresh Face",
    "description": "Have 1 non-bot member join today.",
    "metric": "newMembers",
    "target": 1,
    "reward": 125,
    "minMembers": 10,
    "difficulty": "Medium"
  },
  {
    "id": "new_connections",
    "title": "🌱 New Connections",
    "description": "Have 2 non-bot members join today.",
    "metric": "newMembers",
    "target": 2,
    "reward": 235,
    "minMembers": 25,
    "difficulty": "Medium"
  },
  {
    "id": "new_faces",
    "title": "👋 New Faces",
    "description": "Have 5 non-bot members join today.",
    "metric": "newMembers",
    "target": 5,
    "reward": 500,
    "minMembers": 100,
    "difficulty": "Hard"
  }
];

function dateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getLevelPerks(level) {
  const perks = [];
  if (level >= 2) perks.push('📣 Level-up announcements');
  if (level >= 5) perks.push('🎯 4 daily quests');
  if (level >= 10) perks.push('⚡ 5% Server XP boost');
  if (level >= 15) perks.push('🎯 5 daily quests');
  if (level >= 20) perks.push('💎 Veteran Server milestone');
  if (level >= 25) perks.push('⚡ 10% Server XP boost');
  if (level >= 30) perks.push('🎯 6 daily quests');
  if (level >= 40) perks.push('🏆 Elite Server milestone');
  if (level >= 50) perks.push('👑 Legendary Server milestone');
  return perks;
}
function getXpMultiplier(level) { return level >= 25 ? 1.10 : level >= 10 ? 1.05 : 1; }
function getQuestCount(level) { return level >= 30 ? 6 : level >= 15 ? 5 : level >= 5 ? 4 : 3; }

function pickDailyQuests(guildId, day, level = 1, memberCount = 1) {
  const pool = QUEST_POOL.filter(quest => memberCount >= quest.minMembers);
  let seed = hashSeed(`${guildId}:${day}`);
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const count = Math.min(getQuestCount(level), pool.length);
  const selected = [];
  const starter = pool.find(quest =>
    quest.difficulty === 'Starter' && ['messages', 'commands'].includes(quest.metric));
  if (starter) selected.push(starter);
  // Two easy quests every day, even for a large but currently quiet community.
  const secondStarter = pool.find(quest =>
    quest.difficulty === 'Starter' &&
    !selected.includes(quest) &&
    !selected.some(chosen => chosen.metric === quest.metric));
  if (secondStarter && selected.length < count) selected.push(secondStarter);

  // Give each server a varied set of achievable objectives before repeating metrics.
  for (const quest of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(quest) && !selected.some(chosen => chosen.metric === quest.metric)) {
      selected.push(quest);
    }
  }
  for (const quest of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(quest)) selected.push(quest);
  }
  return selected;
}

export function getQuestCatalog() {
  return QUEST_POOL.map(quest => ({ ...quest }));
}

export function previewDailyQuests(guildId, day, level = 1, memberCount = 1) {
  return pickDailyQuests(guildId, day, level, memberCount).map(quest => ({ ...quest }));
}


const WEEKLY_POOL=[
{id:'warmup',title:'🌱 Weekly Warmup',description:'Send 20 eligible messages this week.',metric:'messages',target:20,reward:250,minMembers:1},
{id:'explorer',title:'🤖 Beacon Explorer',description:'Use 10 eligible commands this week.',metric:'commands',target:10,reward:300,minMembers:1},
{id:'streak',title:'📅 Consistent Crew',description:'Qualifying activity on 3 different days.',metric:'activeDays',target:3,reward:500,minMembers:1},
{id:'team',title:'🔥 Community Spirit',description:'Have 3 unique participants this week.',metric:'uniqueMembers',target:3,reward:400,minMembers:3},
{id:'dailies',title:'🏆 Dedicated Community',description:'Complete 10 daily quests this week.',metric:'dailyQuests',target:10,reward:900,minMembers:1},
{id:'legend',title:'👑 Weekly Legends',description:'Earn 2,000 activity XP this week.',metric:'activityXp',target:2000,reward:1200,minMembers:5},
];
export const FOUNDING_CAP=25;
const FOUNDERS_KEY='beacon:founders:v1';
export function getWeeklyCatalog(){return WEEKLY_POOL.map(q=>({...q}));}
export function utcWeekKey(date=new Date()){
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return d.toISOString().slice(0,10);
}
function pickWeekly(guildId,week,members){
 const pool=WEEKLY_POOL.filter(q=>members>=q.minMembers);
 let seed=hashSeed(guildId+':'+week+':weekly');
 for(let i=pool.length-1;i>0;i--){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const j=seed%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];
 }
 return pool.slice(0,Math.min(3,pool.length)).map(q=>({...q,progress:0,completed:false}));
}
function ensureExtras(data,guildId,members=1,now=new Date()){
 const day=dateKey(now),week=utcWeekKey(now);
 data.sandPendingPayouts=Array.isArray(data.sandPendingPayouts)?data.sandPendingPayouts:[];
 data.sandContributions ||= {day,week,daily:{},weekly:{}};
 if(data.sandContributions.day!==day){data.sandContributions.day=day;data.sandContributions.daily={};}
 if(data.sandContributions.week!==week){data.sandContributions.week=week;data.sandContributions.weekly={};}
 data.dailyHistory=Array.isArray(data.dailyHistory)?data.dailyHistory:[];
 data.weeklyHistory=Array.isArray(data.weeklyHistory)?data.weeklyHistory:[];
 data.contributors ||= {day,week,daily:{},weekly:{},lifetime:{}};
 const c=data.contributors;c.daily ||= {};c.weekly ||= {};c.lifetime ||= {};
 if(c.day!==day){
  if(c.day && Object.keys(c.daily).length)data.dailyHistory.push({
   day:c.day,contributors:Object.keys(c.daily).length,
   actions:Object.values(c.daily).reduce((sum,v)=>sum+(v.messages||0)+(v.commands||0),0)
  });
  c.day=day;c.daily={};
 }
 if(c.week!==week){c.week=week;c.weekly={};}
 if(!data.weekly || data.weekly.week!==week){
  if(data.weekly?.week)data.weeklyHistory.push({...data.weekly,recordedAt:new Date().toISOString()});
  data.weekly={week,quests:pickWeekly(guildId,week,members),days:[],uniqueMembers:[]};
 }
 data.dailyRerollDay ||= null;data.joinDay ||= day;data.joinIds ||= [];
 if(data.joinDay!==day){data.joinDay=day;data.joinIds=[];}
 return data;
}
function updateWeekly(data,metric,userId,dailyCompleted,baseXp,now=new Date()){
 const w=data.weekly;if(!w)return [];
 const day=dateKey(now),m={messages:0,commands:0,activeDays:0,uniqueMembers:0,dailyQuests:dailyCompleted,activityXp:baseXp};
 if(metric==='message')m.messages=1;
 if(metric==='command')m.commands=1;
 if(metric==='message'||metric==='command'){
  if(!w.days.includes(day))w.days.push(day);
  if(userId&&!w.uniqueMembers.includes(userId))w.uniqueMembers.push(userId);
 }
 m.activeDays=w.days.length;m.uniqueMembers=w.uniqueMembers.length;
 const done=[];
 for(const q of w.quests){
  if(q.completed)continue;
  q.progress=Math.min(q.target,['activeDays','uniqueMembers'].includes(q.metric)?m[q.metric]:q.progress+(m[q.metric]||0));
  if(q.progress>=q.target){q.completed=true;data.xp+=q.reward;done.push(q);}
 }
 return done;
}
function addContribution(data,userId,metric){
 if(!userId||!['message','command'].includes(metric))return;
 for(const board of [data.contributors.daily,data.contributors.weekly,data.contributors.lifetime]){
  board[userId] ||= {messages:0,commands:0};
  board[userId][metric==='message'?'messages':'commands']+=1;
 }
}
export function contributorRanking(data,period='weekly',limit=10){
 const board=data.contributors?.[period]||{};
 const hidden=new Set(data.contributionOptOut||[]);
 return Object.entries(board).filter(([userId])=>!hidden.has(userId)).map(([userId,stats])=>({
  userId,messages:stats.messages||0,commands:stats.commands||0,
  actions:(stats.messages||0)+(stats.commands||0)
 })).sort((a,b)=>b.actions-a.actions||a.userId.localeCompare(b.userId)).slice(0,limit);
}

function defaultProgression() {
  return {
    xp: 0,
    level: 1,
    totalMessages: 0,
    totalCommands: 0,
    lastQuestDay: null,
    dailyQuests: [],
    updatedAt: new Date().toISOString(),
    leaderboardExcluded: false,
    weekly: null,weeklyHistory:[],dailyHistory:[],dailyQuestHistory:[],contributors:null,dailyRerollDay:null,joinDay:null,joinIds:[],contributionOptOut:[],
  };
}

function normalizeProgression(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  return {
    ...defaultProgression(),
    ...base,
    xp: Math.max(0, Number(base.xp) || 0),
    level: Math.max(1, Number(base.level) || 1),
    totalMessages: Math.max(0, Number(base.totalMessages) || 0),
    totalCommands: Math.max(0, Number(base.totalCommands) || 0),
    dailyQuests: Array.isArray(base.dailyQuests) ? base.dailyQuests : [],
    leaderboardExcluded: base.leaderboardExcluded === true,
  };
}

function xpForLevel(level) {
  return Math.max(0, (level - 1) * (level - 1) * 500);
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 500)) + 1);
}

function ensureDailyQuests(data, guildId, now = new Date(), memberCount = 1) {
  const day = dateKey(now);

  if (data.lastQuestDay === day && data.dailyQuests.length) {
    return data;
  }

  // Preserve the full previous day's quest outcomes, not only aggregate XP.
  if (data.lastQuestDay && Array.isArray(data.dailyQuests) && data.dailyQuests.length) {
    data.dailyQuestHistory = Array.isArray(data.dailyQuestHistory) ? data.dailyQuestHistory : [];
    if (!data.dailyQuestHistory.some(entry => entry.day === data.lastQuestDay)) {
      data.dailyQuestHistory.push({
        day: data.lastQuestDay,
        quests: data.dailyQuests.map(q => ({
          id:q.id,title:q.title,progress:q.progress,target:q.target,
          completed:q.completed===true,reward:q.reward,
        })),
      });
    }
  }
  data.lastQuestDay = day;
  data.dailyQuests = pickDailyQuests(guildId, day, data.level, memberCount).map(quest => ({
    ...quest,
    progress: 0,
    completed: false,
  }));

  return data;
}

export async function withGuildLock(guildId, task, client = null) {
  const previous = guildLocks.get(guildId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  guildLocks.set(guildId, current);

  await previous.catch(() => {});

  let lockClient=null,locked=false,releaseSlot=null;
  try {
    const pool=client?.db?.db?.pool && client.db.db.isAvailable?.() ? client.db.db.pool : null;
    if(pool) {
      releaseSlot=await reserveAdvisorySlot(pool);
      lockClient=await pool.connect();
      await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))',[String(guildId)]);
      locked=true;
    }
    return await task();
  } finally {
    if(locked)await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))',[String(guildId)]).catch(()=>{});
    lockClient?.release();
    releaseSlot?.();
    release();
    if (guildLocks.get(guildId) === current) {
      guildLocks.delete(guildId);
    }
  }
}

async function load(client, guildId, { persistRollover = false } = {}) {
  const key = `${KEY_PREFIX}${guildId}${KEY_SUFFIX}`;
  const raw = await client.db.get(key, null);
  const memberCount = client.guilds?.cache?.get(guildId)?.memberCount ?? 1;
  const now = new Date();
  const data = ensureExtras(
    ensureDailyQuests(normalizeProgression(raw), guildId, now, memberCount),
    guildId, memberCount, now,
  );
  // Panels may be the first activity after UTC reset. Save the new quests
  // and previous history immediately, even if nobody chats that day.
  if (persistRollover && (
    !raw || raw.lastQuestDay !== data.lastQuestDay ||
    raw.weekly?.week !== data.weekly?.week ||
    raw.contributors?.day !== data.contributors?.day ||
    raw.contributors?.week !== data.contributors?.week ||
    raw.joinDay !== data.joinDay
  )) {
    await save(client, guildId, data);
  }
  return data;
}

async function save(client, guildId, data) {
  data.level = levelFromXp(data.xp);
  data.updatedAt = new Date().toISOString();
  const stored = await client.db.set(`${KEY_PREFIX}${guildId}${KEY_SUFFIX}`, data);
  if (stored === false) throw new Error('Persistent progression storage rejected the write.');
  return data;
}

function isEnabled(config) {
  return config?.serverProgression?.enabled === true;
}

function applyMetric(data, metric, amount = 1) {
  const unique = metric === 'uniqueMembers' ? amount : null;
  for (const quest of data.dailyQuests) {
    if (quest.completed || quest.metric !== metric) continue;
    quest.progress = unique === null
      ? Math.min(quest.target, quest.progress + amount)
      : Math.min(quest.target, Math.max(quest.progress, amount));
  }
}

function completeQuests(data) {
  let reward = 0;
  const completedNow = [];

  for (const quest of data.dailyQuests) {
    if (!quest.completed && quest.progress >= quest.target) {
      quest.completed = true;
      reward += quest.reward;
      completedNow.push(quest);
    }
  }

  if (reward) {
    data.xp += reward;
  }

  return completedNow;
}

function addBaseXp(data, amount) {
  const before = data.level;
  data.xp += Math.floor(amount * getXpMultiplier(data.level));
  data.level = levelFromXp(data.xp);
  return { before, after: data.level };
}

async function recordActivity(client, guildId, metric, options = {}) {
  try {
    const result = await withGuildLock(guildId, async () => {
      const config = options.config;
      if (!isEnabled(config)) return null;

      const data = await load(client, guildId);
      const previousLevel = data.level;
      const previousXp = data.xp;
      const now = Date.now();

      if (metric === 'message') {
        const content = String(options.content || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (content.length < 3 && !options.hasAttachments) return null;
        const signature = content || '[attachment]';
        const bucketKey = `${guildId}:${options.userId}`;
        const recent = (activityBuckets.get(bucketKey) || []).filter(item => now - item.at < 60_000);
        if (recent.length >= 6 ||
            (recent.length && now - recent[recent.length - 1].at < 8_000) ||
            recent.some(item => item.signature === signature)) return null;

        recent.push({ at: now, signature });
        activityBuckets.set(bucketKey, recent);
        data.totalMessages += 1;
        applyMetric(data, 'messages', 1);
        for (const quest of data.dailyQuests) {
          if (quest.completed) continue;
          if (quest.metric === 'channels' && options.channelId) {
            quest._channels = Array.isArray(quest._channels) ? quest._channels : [];
            if (!quest._channels.includes(options.channelId)) quest._channels.push(options.channelId);
            quest.progress = Math.min(quest.target, quest._channels.length);
          }
          if (quest.metric === 'uniqueMembers' && options.userId) {
            quest._members = Array.isArray(quest._members) ? quest._members : [];
            if (!quest._members.includes(options.userId)) quest._members.push(options.userId);
            quest.progress = Math.min(quest.target, quest._members.length);
          }
        }
        addBaseXp(data, 5);
      } else if (metric === 'command') {
        const bucketKey = `${guildId}:${options.userId}`;
        if (!options.userId || now - (commandBuckets.get(bucketKey) || 0) < 30_000) return null;
        commandBuckets.set(bucketKey, now);
        data.totalCommands += 1;
        applyMetric(data, 'commands', 1);
        addBaseXp(data, 10);
      } else if (metric === 'channel') {
        const channels = new Set(data.dailyQuests.flatMap(q => q._channels || []));
        channels.add(options.channelId);
        for (const quest of data.dailyQuests) {
          if (quest.metric === 'channels' && !quest.completed) {
            quest._channels = [...channels].slice(0, quest.target);
            quest.progress = quest._channels.length;
          }
        }
      } else if (metric === 'newMembers') {
        if(!options.userId || data.joinIds.includes(options.userId))return null;
        data.joinIds.push(options.userId);
        applyMetric(data, 'newMembers', 1);
        addBaseXp(data, 25);
      } else if (metric === 'uniqueMember') {
        for (const quest of data.dailyQuests) {
          if (quest.metric !== 'uniqueMembers' || quest.completed) continue;
          quest._members = Array.isArray(quest._members) ? quest._members : [];
          if (!quest._members.includes(options.userId)) {
            quest._members.push(options.userId);
            quest.progress = Math.min(quest.target, quest._members.length);
          }
        }
      }

      // Track contributors for shared quests without changing existing XP.
      recordQuestContribution(data,guildId,metric,options,0,metric==='message'?5:metric==='command'?10:0);
      const completed = completeQuests(data);
      addContribution(data,options.userId,metric);
      const earned=['message','command'].includes(metric)
        ? data.xp-previousXp-completed.reduce((sum,q)=>sum+q.reward,0) : 0;
      if(completed.length)recordQuestContribution(data,guildId,'dailyCompleted',options,completed.length,0);
      const weeklyCompleted=updateWeekly(data,metric,options.userId,completed.length,earned);
      queueSharedSandRewards(data,guildId,completed,weeklyCompleted);
      await save(client, guildId, data);

      return { data, completed, weeklyCompleted, pendingSand:[...data.sandPendingPayouts], level: data.level, leveledUp: data.level > previousLevel, previousLevel, levelPerks: getLevelPerks(data.level) };
    },client);

    // A saved payout intent survives a restart. Atomic wallet claims guarantee
    // that replaying a pending event never credits a user twice.
    if(result?.pendingSand?.length){
      const settled=[];
      for(const payout of result.pendingSand.slice(0,150)){
        try {
          await grantQuestSandCoins(client,payout);
          settled.push(payout.key);
        }catch(error){
          logger.warn('Sand Coins payout retained for retry',{guildId,error:error.message});
        }
      }
      if(settled.length)await withGuildLock(guildId,async()=>{
        const latest=await load(client,guildId);
        const paid=new Set(settled);
        latest.sandPendingPayouts=(latest.sandPendingPayouts||[]).filter(p=>!paid.has(p.key));
        await save(client,guildId,latest);
      },client);
    }
    return result;
  } catch (error) {
    logger.debug('Server progression update failed', { guildId, error: error.message });
    return null;
  }
}

export async function isServerProgressionEnabled(client, guildId) {
  try {
    const { getGuildConfig } = await import('./config/guildConfig.js');
    return isEnabled(await getGuildConfig(client, guildId));
  } catch {
    return false;
  }
}

async function announceLevelUp(channel, result, guildName) {
  if (!result?.leveledUp || result.level < 2 || !channel?.send) return;
  await channel.send({ embeds: [createEmbed({
    title: '🚀 Server Level Up!',
    description: `**${guildName}** reached **Level ${result.level}**!\n\n✨ The server has unlocked new progression perks.\n${result.levelPerks?.length ? `\n${result.levelPerks.join('\\n')}` : ''}`,
    color: 'success',
  })] }).catch(() => {});
}

export async function recordMessageActivity(client, message, config = null) {
  if (!message?.guild || message.author?.bot) return null;

  const effectiveConfig = config || await (async () => {
    const { getGuildConfig } = await import('./config/guildConfig.js');
    return getGuildConfig(client, message.guild.id);
  })();

  const result = await recordActivity(client, message.guild.id, 'message', {
    config: effectiveConfig,
    userId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    hasAttachments: Boolean(message.attachments?.size),
  });

  if (result) {
    await announceLevelUp(message.channel, result, message.guild.name);
    for (const quest of [...(result.completed || []),...(result.weeklyCompleted || [])]) {
      await message.channel.send({
        embeds: [createEmbed({
          title: (result.weeklyCompleted || []).some(q=>q.id===quest.id) ? '🏆 Weekly Challenge Complete!' : '🎉 Daily Quest Complete!',
          description: `The server completed **${quest.title}**!\n\n🏆 **+${quest.reward.toLocaleString()} Server XP**`,
          color: 'success',
        })],
      }).catch(() => {});
    }
  }
  return result;
}

export async function recordCommandActivity(client, interaction, config = null) {
  if (!interaction?.guild || interaction.user?.bot) return null;
  if (['progression', 'rank', 'levels', 'giveexp', 'removeexp', 'removeleaderboard', 'restoreleaderboard'].includes(interaction.commandName)) return null;

  const effectiveConfig = config || await (async () => {
    const { getGuildConfig } = await import('./config/guildConfig.js');
    return getGuildConfig(client, interaction.guild.id);
  })();

  const result = await recordActivity(client, interaction.guild.id, 'command', {
    config: effectiveConfig,
    userId: interaction.user.id,
  });
  await announceLevelUp(interaction.channel, result, interaction.guild.name);
  return result;
}

export async function recordMemberJoinActivity(client, member, config = null) {
  if (!member?.guild || member.user?.bot) return null;

  const effectiveConfig = config || await (async () => {
    const { getGuildConfig } = await import('./config/guildConfig.js');
    return getGuildConfig(client, member.guild.id);
  })();

  const result = await recordActivity(client, member.guild.id, 'newMembers', {
    config: effectiveConfig,
    userId: member.id,
  });
  await announceLevelUp(member.guild.systemChannel, result, member.guild.name);
  return result;
}

export async function addServerXp(client, guildId, amount) {
  const xpAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!xpAmount) return null;

  return withGuildLock(guildId, async () => {
    const data = await load(client, guildId);
    const oldLevel = data.level;
    const oldXp = data.xp;
    data.xp += xpAmount;
    data.level = levelFromXp(data.xp);
    await save(client, guildId, data);
    return {
      data,
      oldXp,
      oldLevel,
      amount: xpAmount,
      leveledUp: data.level > oldLevel,
      levelPerks: getLevelPerks(data.level),
    };
  },client);
}

export async function getServerProgression(client, guildId) {
  return withGuildLock(guildId, () => load(client, guildId, { persistRollover: true }), client);
}

export async function getGlobalProgressionLeaderboard(client) {
  const keys = await client.db.list('guild:');
  const entries = [];

  // Bounded parallel reads keep leaderboard pages responsive when the bot
  // grows, without opening an unbounded number of database requests.
  const eligibleKeys = keys.filter(key => key.startsWith(KEY_PREFIX) && key.endsWith(KEY_SUFFIX));
  const batchSize = 8;
  for (let index = 0; index < eligibleKeys.length; index += batchSize) {
    const batch = eligibleKeys.slice(index, index + batchSize);
    const rows = await Promise.all(batch.map(async key => {
      const guildId = key.slice(KEY_PREFIX.length, -KEY_SUFFIX.length);
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return null;
      const raw = await client.db.get(key, null);
      if (!raw) return null;
      const data = normalizeProgression(raw);
      if (data.leaderboardExcluded) return null;
      return { guildId, guildName: guild.name, xp: data.xp, level: levelFromXp(data.xp) };
    }));
    entries.push(...rows.filter(Boolean));
  }

  // Stable tiebreaks prevent servers with equal XP swapping ranks on refresh.
  return entries.sort((a, b) => b.xp - a.xp || a.guildId.localeCompare(b.guildId));
}

export function getLevelProgress(data) {
  const currentLevelXp = xpForLevel(data.level);
  const nextLevelXp = xpForLevel(data.level + 1);
  const progressXp = Math.max(0, data.xp - currentLevelXp);
  const neededXp = Math.max(1, nextLevelXp - currentLevelXp);
  return {
    currentLevelXp,
    nextLevelXp,
    progressXp,
    neededXp,
    percent: Math.min(100, Math.floor((progressXp / neededXp) * 100)),
  };
}


/** Every progression mutation uses the same per-server lock and persistent key as XP. */
export async function mutateServerProgression(client,guildId,mutator){
 return withGuildLock(guildId,async()=>{
  const data=await load(client,guildId);
  const result=await mutator(data);
  if(result?.changed)await save(client,guildId,data);
  return {data,result};
 },client);
}
export async function rerollDailyQuest(client,guildId,questId){
 return mutateServerProgression(client,guildId,data=>{
  const day=dateKey();
  if(data.dailyRerollDay===day)return {changed:false,error:'Daily reroll already used.'};
  const idx=data.dailyQuests.findIndex(q=>q.id===questId&&!q.completed);
  if(idx<0)return {changed:false,error:'Choose an unfinished quest.'};
  const members=client.guilds?.cache?.get(guildId)?.memberCount||1;
  const used=new Set(data.dailyQuests.map(q=>q.id));
  const candidates=QUEST_POOL.filter(q=>members>=q.minMembers&&!used.has(q.id));
  if(!candidates.length)return {changed:false,error:'No other quests are currently available.'};
  let seed=hashSeed(guildId+':'+day+':reroll:'+questId);
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const sameDifficulty=candidates.filter(q=>q.difficulty===data.dailyQuests[idx].difficulty);
  const choices=sameDifficulty.length?sameDifficulty:candidates;
  const next={...choices[seed%choices.length],progress:0,completed:false};
  const previous=data.dailyQuests[idx].title;
  data.dailyQuests[idx]=next;data.dailyRerollDay=day;
  return {changed:true,previous,next};
 });
}
/** Immutable registration ledger, shared between processes using PostgreSQL advisory lock. */
export async function registerFoundingServers(client){
 return withGuildLock('beacon-founders',async()=>{
  const raw=await client.db.get(FOUNDERS_KEY,null);
  const entries=Array.isArray(raw?.entries)?raw.entries:[];
  const seen=new Set(entries.map(x=>x.guildId));
  const guilds=[...client.guilds.cache.values()].sort((a,b)=>(a.joinedTimestamp||0)-(b.joinedTimestamp||0)||a.id.localeCompare(b.id));
  for(const guild of guilds){
    if(entries.length>=FOUNDING_CAP)break;
    if(seen.has(guild.id))continue;
    entries.push({guildId:guild.id,number:entries.length+1,awardedAt:new Date().toISOString()});
    seen.add(guild.id);
  }
  if(entries.length!==(raw?.entries?.length||0)){
    const stored=await client.db.set(FOUNDERS_KEY,{version:1,entries});
    if(stored===false)throw new Error('Founding registry storage rejected the write.');
  }
  return entries;
 },client);
}
export async function getFoundingBadge(client,guildId){
 const raw=await client.db.get(FOUNDERS_KEY,{entries:[]});
 return (raw?.entries||[]).find(x=>x.guildId===guildId)||null;
}
