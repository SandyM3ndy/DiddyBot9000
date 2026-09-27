import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const KEY_PREFIX = 'guild:';
const KEY_SUFFIX = ':progression';
const DAY_MS = 24 * 60 * 60 * 1000;
const activityBuckets = new Map();
const guildLocks = new Map();

const QUEST_POOL = [
  {
    id: 'chatterbox',
    title: '🗣️ Chatterbox',
    description: 'Send 100 messages across the server.',
    metric: 'messages',
    target: 100,
    reward: 350,
  },
  {
    id: 'social_butterfly',
    title: '🦋 Social Butterfly',
    description: 'Get 15 different members chatting today.',
    metric: 'uniqueMembers',
    target: 15,
    reward: 450,
  },
  {
    id: 'command_centre',
    title: '🤖 Command Centre',
    description: 'Use 25 bot commands across the server.',
    metric: 'commands',
    target: 25,
    reward: 400,
  },
  {
    id: 'channel_hopper',
    title: '🚪 Channel Hopper',
    description: 'Have conversations in 5 different channels.',
    metric: 'channels',
    target: 5,
    reward: 300,
  },
  {
    id: 'busy_server',
    title: '🔥 Busy Server',
    description: 'Send 250 messages across the server.',
    metric: 'messages',
    target: 250,
    reward: 650,
  },
  {
    id: 'new_faces',
    title: '👋 New Faces',
    description: 'Welcome 5 new members today.',
    metric: 'newMembers',
    target: 5,
    reward: 500,
  },
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

function pickDailyQuests(guildId, day, level = 1) {
  const pool = [...QUEST_POOL];
  let seed = hashSeed(`${guildId}:${day}`);
  const selected = [];

  while (selected.length < Math.min(getQuestCount(level), pool.length) && pool.length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const index = seed % pool.length;
    selected.push(pool.splice(index, 1)[0]);
  }

  return selected;
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

function ensureDailyQuests(data, guildId, now = new Date()) {
  const day = dateKey(now);

  if (data.lastQuestDay === day && data.dailyQuests.length) {
    return data;
  }

  data.lastQuestDay = day;
  data.dailyQuests = pickDailyQuests(guildId, day, data.level).map(quest => ({
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
  return ensureDailyQuests(normalizeProgression(raw), guildId);
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
        data.totalMessages += 1;
        applyMetric(data, 'messages', 1);

        for (const quest of data.dailyQuests) {
          if (quest.metric === 'channels' && !quest.completed && options.channelId) {
            quest._channels = Array.isArray(quest._channels) ? quest._channels : [];
            if (!quest._channels.includes(options.channelId)) {
              quest._channels.push(options.channelId);
            }
            quest.progress = Math.min(quest.target, quest._channels.length);
          }
          if (quest.metric === 'uniqueMembers' && !quest.completed && options.userId) {
            quest._members = Array.isArray(quest._members) ? quest._members : [];
            if (!quest._members.includes(options.userId)) {
              quest._members.push(options.userId);
            }
            quest.progress = Math.min(quest.target, quest._members.length);
          }
        }

        const bucketKey = `${guildId}:${options.userId}`;
        const bucket = (activityBuckets.get(bucketKey) || []).filter(ts => now - ts < 60_000);
        if (bucket.length < 10) {
          bucket.push(now);
          activityBuckets.set(bucketKey, bucket);
          addBaseXp(data, 5);
        }
      } else if (metric === 'command') {
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
  });

  if (result) {
    await announceLevelUp(message.channel, result, message.guild.name);

    const channelResult = await recordActivity(client, message.guild.id, 'channel', {
      config: effectiveConfig,
      channelId: message.channel.id,
    });
    const memberResult = await recordActivity(client, message.guild.id, 'uniqueMember', {
      config: effectiveConfig,
      userId: message.author.id,
    });

    const completed = [
      ...(result.completed || []),
      ...(channelResult?.completed || []),
      ...(memberResult?.completed || []),
    ];

    if (completed.length) {
      const unique = [...new Map(completed.map(q => [q.id, q])).values()];
      for (const quest of unique) {
        await message.channel.send({
          embeds: [createEmbed({
            title: '🎉 Daily Quest Complete!',
            description: `The server completed **${quest.title}**!

🏆 **+${quest.reward.toLocaleString()} Server XP**`,
            color: 'success',
          })],
        }).catch(() => {});
      }
    }
  }

  return result;
}

export async function recordCommandActivity(client, interaction, config = null) {
  if (!interaction?.guild || interaction.user?.bot) return null;

  const effectiveConfig = config || await (async () => {
    const { getGuildConfig } = await import('./config/guildConfig.js');
    return getGuildConfig(client, interaction.guild.id);
  })();

  const result = await recordActivity(client, interaction.guild.id, 'command', {
    config: effectiveConfig,
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
