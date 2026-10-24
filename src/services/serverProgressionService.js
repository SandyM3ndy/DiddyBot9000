import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const KEY_PREFIX = 'guild:';
const KEY_SUFFIX = ':progression';
const DAY_MS = 24 * 60 * 60 * 1000;
const activityBuckets = new Map();
const commandBuckets = new Map();
const guildLocks = new Map();

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

  data.lastQuestDay = day;
  data.dailyQuests = pickDailyQuests(guildId, day, data.level, memberCount).map(quest => ({
    ...quest,
    progress: 0,
    completed: false,
  }));

  return data;
}

async function withGuildLock(guildId, task) {
  const previous = guildLocks.get(guildId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  guildLocks.set(guildId, current);

  await previous.catch(() => {});

  try {
    return await task();
  } finally {
    release();
    if (guildLocks.get(guildId) === current) {
      guildLocks.delete(guildId);
    }
  }
}

async function load(client, guildId) {
  const key = `${KEY_PREFIX}${guildId}${KEY_SUFFIX}`;
  const raw = await client.db.get(key, defaultProgression());
  const memberCount = client.guilds?.cache?.get(guildId)?.memberCount ?? 1;
  return ensureDailyQuests(normalizeProgression(raw), guildId, new Date(), memberCount);
}

async function save(client, guildId, data) {
  data.level = levelFromXp(data.xp);
  data.updatedAt = new Date().toISOString();
  await client.db.set(`${KEY_PREFIX}${guildId}${KEY_SUFFIX}`, data);
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

      const completed = completeQuests(data);
      await save(client, guildId, data);

      return { data, completed, level: data.level, leveledUp: data.level > previousLevel, previousLevel, levelPerks: getLevelPerks(data.level) };
    });

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
    for (const quest of result.completed || []) {
      await message.channel.send({
        embeds: [createEmbed({
          title: '🎉 Daily Quest Complete!',
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
  });
}

export async function getServerProgression(client, guildId) {
  const data = await load(client, guildId);
  return data;
}

export async function getGlobalProgressionLeaderboard(client) {
  const keys = await client.db.list('guild:');
  const entries = [];

  for (const key of keys) {
    if (!key.endsWith(KEY_SUFFIX)) continue;
    const guildId = key.slice(KEY_PREFIX.length, -KEY_SUFFIX.length);
    if (!guildId) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const raw = await client.db.get(key, null);
    const data = normalizeProgression(raw);
    if (data.leaderboardExcluded === true) continue;
    entries.push({
      guildId,
      guildName: guild.name,
      xp: data.xp,
      level: levelFromXp(data.xp),
    });
  }

  return entries.sort((a, b) => b.xp - a.xp);
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
