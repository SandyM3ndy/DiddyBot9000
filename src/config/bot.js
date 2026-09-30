import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE (what users see under the bot name)
  // =========================
  presence: {
    status: "online",
    activities: [
      {
        name: "Your community's all-in-one Discord assistant.",
        type: 4,
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    primaryOwnerId: "1022691434974957618",
    deleteCommands: true,
    testGuildId: process.env.TEST_GUILD_ID,
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM
  // =========================
  applications: {
    defaultQuestions: [
      { question: "What is your name?", required: true },
      { question: "How old are you?", required: true },
      { question: "Why do you want to join?", required: true },
    ],
    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },
    applicationCooldown: 24,
    deleteDeniedAfter: 7,
    deleteApprovedAfter: 30,
    managerRoles: [],
  },

  // =========================
  // EMBED COLORS & BEACON BRANDING
  // =========================
  embeds: {
    colors: {
      primary: "#5865F2",
      secondary: "#2F3136",
      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",
      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",
      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",
      giveaway: {
        active: "#57F287",
        ended: "#ED4245",
      },
      ticket: {
        open: "#57F287",
        claimed: "#FAA61A",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#F1C40F",
      moderation: "#9B59B6",
      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      text: "Beacon • Your community's all-in-one Discord assistant.",
      icon: null,
    },
    thumbnail: null,
    author: {
      name: "Beacon",
      icon: null,
      url: null,
    },
  },

  economy: {
    currency: { name: "coins", namePlural: "coins", symbol: "$" },
    startingBalance: 0,
    baseBankCapacity: 100000,
    dailyAmount: 100,
    workMin: 10,
    workMax: 100,
    begMin: 5,
    begMax: 50,
    robSuccessRate: 0.4,
    robFailJailTime: 3600000,
  },

  shop: {},

  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: { emoji: "⚪", color: "#95A5A6", label: "None" },
      low: { emoji: "🟢", color: "#2ECC71", label: "Low" },
      medium: { emoji: "🟡", color: "#F1C40F", label: "Medium" },
      high: { emoji: "🔴", color: "#E74C3C", label: "High" },
      urgent: { emoji: "🚨", color: "#E91E63", label: "Urgent" },
    },
    defaultPriority: "none",
    archiveCategory: null,
    logChannel: null,
  },

  giveaways: {
    defaultDuration: 86400000,
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000,
    maximumDuration: 2592000000,
    allowedRoles: [],
    bypassRoles: [],
  },

  verification: {
    defaultMessage: "Click the button below to verify yourself and gain access to the server!",
    defaultButtonText: "Verify",
    autoVerify: {
      defaultCriteria: "none",
      defaultAccountAgeDays: 7,
      serverSizeThreshold: 1000,
      minAccountAge: 1,
      maxAccountAge: 365,
      sendDMNotification: true,
      criteria: {
        account_age: "Account must be older than specified days",
        server_size: "All users if server has less than 1000 members",
        none: "All users immediately"
      }
    },
    maxAuditMetadataBytes: 4096,
    maxInMemoryAuditEntries: 1000,
    logAllVerifications: true,
    keepAuditTrail: true,
  },

  welcome: {
    defaultWelcomeMessage: "Welcome {user} to {server}! We now have {memberCount} members!",
    defaultGoodbyeMessage: "{user} has left the server. We now have {memberCount} members.",
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null,
  },

  counters: {
    defaults: {
      name: "{name} Counter",
      description: "Server {name} counter",
      type: "voice",
      channelName: "{name}-{count}",
    },
    permissions: {
      deny: ["VIEW_CHANNEL"],
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      created: "✅ Created counter **{name}**",
      deleted: "🗑️ Deleted counter **{name}**",
      updated: "🔄 Updated counter **{name}**",
    },
    types: {
      members: {
        name: "👥 Members",
        description: "Total members in the server",
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 Bots",
        description: "Total bot accounts in the server",
        getCount: (guild) => guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "👤 Humans",
        description: "Total human members (non-bots)",
        getCount: (guild) => guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  messages: {
    noPermission: "You do not have permission to use this command.",
    errorOccurred: "An error occurred while executing the command.",
    missingPermissions: "I am missing required permissions to perform this action.",
    commandDisabled: "This command has been disabled.",
    maintenanceMode: "The bot is currently in maintenance mode.",
  },

  features: {
    economy: true,
    moderation: true,
    logging: true,
    welcome: true,
    tickets: true,
    giveaways: true,
    counter: true,
    verification: true,
    reactionRoles: true,
    joinToCreate: true,
    antinuke: true,
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
    music: true,
  },
};

export function validateConfig(config) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN exists:', !!process.env.TOKEN);
    logger.debug('CLIENT_ID exists:', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID exists:', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required (DISCORD_TOKEN or TOKEN environment variable)");
  }
  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required (CLIENT_ID environment variable)");
  }

  if (process.env.NODE_ENV === 'production') {
    const hasConnectionUrl = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
    const hasHostConfig = Boolean(process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD);
    if (!hasConnectionUrl && !hasHostConfig) {
      errors.push("PostgreSQL connection is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_HOST + POSTGRES_USER + POSTGRES_PASSWORD)");
    }

    const weakSecrets = new Set(["password", "postgres", "titanbot", "youshallnotpass", "change-me", "changeme", "secret"]);
    const postgresPassword = process.env.POSTGRES_PASSWORD;
    if (postgresPassword && weakSecrets.has(postgresPassword.toLowerCase())) {
      errors.push("POSTGRES_PASSWORD is using a known/default weak secret; use a long random password.");
    }
    const lavalinkPassword = process.env.LAVALINK_PASSWORD;
    if (lavalinkPassword && weakSecrets.has(lavalinkPassword.toLowerCase())) {
      errors.push("LAVALINK_PASSWORD is using a known/default weak secret; use a long random password.");
    }
    const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean) || [];
    if (corsOrigins.includes("*")) {
      errors.push("CORS_ORIGIN=* is not allowed in production; configure explicit trusted origins.");
    }
    if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.length < 50) {
      errors.push("DISCORD_TOKEN appears invalid or truncated; refuse to start with a suspiciously short token.");
    }
  }
  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  console.error("========================================");
  console.error("BOT CONFIGURATION ERRORS:");
  console.error(configErrors.join("\n"));
  console.error("========================================");
  if (process.env.NODE_ENV === "production") process.exit(1);
}

export const BotConfig = botConfig;

const COMMAND_CATEGORY_FEATURE_MAP = {
  community: "community",
  economy: "economy",
  fun: "fun",
  giveaway: "giveaways",
  jointocreate: "joinToCreate",
  logging: "logging",
  moderation: "moderation",
  music: "music",
  reaction_roles: "reactionRoles",
  search: "search",
  serverstats: "counter",
  ticket: "tickets",
  tools: "tools",
  utility: "utility",
  verification: "verification",
  welcome: "welcome",
};

function normalizeCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}
export function getCommandPrefix() { return botConfig.commands?.prefix ?? "!"; }
export function getBotOwners() { return (botConfig.commands?.owners ?? []).map((id) => String(id).trim()).filter(Boolean); }
export function isBotOwner(userId) { return !!userId && getBotOwners().includes(String(userId)); }
export function isMaintenanceMode() { return botConfig.commands?.maintenanceMode === true; }
export function getBotMessage(key, replacements = {}) {
  let message = botConfig.messages?.[key] || key;
  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(value));
  }
  return message;
}
export function isFeatureEnabled(featureKey) { return !featureKey || botConfig.features?.[featureKey] !== false; }
export function isCommandCategoryEnabled(category) {
  const normalized = normalizeCategoryKey(category);
  if (!normalized || normalized === "core") return true;
  const featureKey = COMMAND_CATEGORY_FEATURE_MAP[normalized];
  if (!featureKey) return true;
  return isFeatureEnabled(featureKey);
}
export function getApplicationStatusColor(status) {
  const colors = botConfig.applications?.statusColors || {};
  const hex = colors[status];
  return hex ? getColor(hex) : getColor(status === "approved" ? "success" : status === "denied" ? "error" : "warning");
}
export function getDefaultApplicationQuestions() {
  return (botConfig.applications?.defaultQuestions || []).map((entry) => typeof entry === "string" ? entry : entry.question).filter(Boolean);
}
export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) return parseInt(path.replace("#", ""), 16);
  const result = path.split(".").reduce((obj, key) => obj && obj[key] !== undefined ? obj[key] : fallback, botConfig.embeds.colors);
  if (typeof result === "string" && result.startsWith("#")) return parseInt(result.replace("#", ""), 16);
  return result;
}
export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) => typeof color === "string" ? color : Object.values(color));
  return colors[Math.floor(Math.random() * colors.length)];
}
export default botConfig;
