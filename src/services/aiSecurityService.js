import axios from 'axios';
import { logger } from '../utils/logger.js';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.ANTINUKE_AI_MODEL || 'gpt-5.6-luna';
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HISTORY = 50;
const AI_COOLDOWN_MS = 2_500;

const actorHistory = new Map();
const aiCooldowns = new Map();

function getHistoryKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function recordActorBehavior(guildId, userId, action) {
  const key = getHistoryKey(guildId, userId);
  const now = Date.now();
  const history = actorHistory.get(key) || [];

  history.push({ action, timestamp: now });
  const recent = history
    .filter((entry) => now - entry.timestamp <= WINDOW_MS)
    .slice(-MAX_HISTORY);

  actorHistory.set(key, recent);
  return recent;
}

function localRisk(history, action) {
  const count = history.length;
  const uniqueActions = new Set(history.map((entry) => entry.action)).size;
  const destructiveKeywords = /(delete|ban|kick|webhook|permission|role|channel|prune)/i;
  const destructiveCount = history.filter((entry) => destructiveKeywords.test(entry.action)).length;

  let score = Math.min(100, count * 8);
  if (uniqueActions >= 2) score += 10;
  if (uniqueActions >= 4) score += 15;
  if (destructiveCount >= 4) score += 20;
  if (destructiveKeywords.test(action)) score += 5;

  return Math.min(100, score);
}

function parseModelOutput(response) {
  const outputText = response?.output_text;
  if (typeof outputText !== 'string' || !outputText.trim()) return null;

  try {
    return JSON.parse(outputText);
  } catch {
    const jsonBlock = outputText.match(/\{[\s\S]*\}/);
    if (!jsonBlock) return null;
    try {
      return JSON.parse(jsonBlock[0]);
    } catch {
      return null;
    }
  }
}

async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await axios.post(
    OPENAI_URL,
    {
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'system',
          content:
            'You are a Discord server security analyst. Analyze only the supplied security telemetry. Do not invent facts. Return strict JSON with riskScore (0-100), confidence (0-1), severity (normal|suspicious|high|critical), recommendation (monitor|alert|protect|kick), and reasons (array of short strings). A single ordinary moderation action is not a nuke. Coordinated destructive actions in a short period are high risk.',
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'antinuke_risk',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              riskScore: { type: 'number', minimum: 0, maximum: 100 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              severity: {
                type: 'string',
                enum: ['normal', 'suspicious', 'high', 'critical'],
              },
              recommendation: {
                type: 'string',
                enum: ['monitor', 'alert', 'protect', 'kick'],
              },
              reasons: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['riskScore', 'confidence', 'severity', 'recommendation', 'reasons'],
          },
        },
      },
      max_output_tokens: 300,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 3500,
    },
  );

  return parseModelOutput(response.data);
}

export async function analyzeAntiNukeBehavior({
  guild,
  executor,
  action,
  details = '',
  recentActions = [],
  threshold = 5,
}) {
  if (!guild?.id || !executor?.id) return null;

  const history = recordActorBehavior(guild.id, executor.id, action);
  const key = getHistoryKey(guild.id, executor.id);
  const now = Date.now();

  // Avoid hammering an AI API during a live nuke. Hard rules continue to run
  // independently while the AI samples the behavior.
  if (aiCooldowns.get(key) > now) {
    return {
      source: 'local',
      riskScore: localRisk(history, action),
      confidence: 0.55,
      severity: 'suspicious',
      recommendation: 'monitor',
      reasons: ['AI analysis is cooling down; deterministic Anti-Nuke protection remains active.'],
      historyCount: history.length,
    };
  }

  aiCooldowns.set(key, now + AI_COOLDOWN_MS);

  const destructiveCount = history.filter((entry) =>
    /(delete|ban|kick|webhook|permission|role|channel|prune)/i.test(entry.action)
  ).length;

  const payload = {
    server: {
      id: guild.id,
      memberCount: guild.memberCount,
      channelCount: guild.channels?.cache?.size ?? null,
      roleCount: guild.roles?.cache?.size ?? null,
    },
    actor: {
      id: executor.id,
      bot: executor.bot === true,
      accountCreatedAt: executor.createdAt?.toISOString?.() ?? null,
      joinedAt: guild.members.cache.get(executor.id)?.joinedAt?.toISOString?.() ?? null,
      permissions: guild.members.cache.get(executor.id)?.permissions?.toArray?.() ?? [],
    },
    incident: {
      action,
      details,
      configuredThreshold: threshold,
      actionsInSecurityWindow: recentActions.map((entry) => entry.action),
      behaviorWindow: history.map((entry) => ({
        action: entry.action,
        ageMs: now - entry.timestamp,
      })),
      totalRecentActions: history.length,
      recentDestructiveActions: destructiveCount,
      uniqueRecentActions: [...new Set(history.map((entry) => entry.action))],
    },
  };

  try {
    const aiResult = await callOpenAI(payload);
    if (aiResult) {
      const normalized = {
        source: 'openai',
        riskScore: Math.max(0, Math.min(100, Number(aiResult.riskScore) || 0)),
        confidence: Math.max(0, Math.min(1, Number(aiResult.confidence) || 0)),
        severity: aiResult.severity,
        recommendation: aiResult.recommendation,
        reasons: Array.isArray(aiResult.reasons) ? aiResult.reasons.slice(0, 5) : [],
        historyCount: history.length,
      };

      logger.warn(
        `Anti-Nuke AI analysis in ${guild.name}: actor=${executor.tag || executor.id}, risk=${normalized.riskScore}, confidence=${normalized.confidence}, severity=${normalized.severity}, recommendation=${normalized.recommendation}`
      );
      return normalized;
    }
  } catch (error) {
    logger.warn(`Anti-Nuke AI analysis unavailable in ${guild.name}: ${error.message}`);
  }

  const score = localRisk(history, action);
  return {
    source: 'local',
    riskScore: score,
    confidence: 0.6,
    severity: score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 40 ? 'suspicious' : 'normal',
    recommendation: score >= 85 ? 'protect' : score >= 65 ? 'alert' : 'monitor',
    reasons: [
      `${history.length} security actions observed in the adaptive behavior window.`,
      `${destructiveCount} recent actions match destructive/security-sensitive patterns.`,
    ],
    historyCount: history.length,
  };
}

export function clearAntiNukeAIData(guildId) {
  for (const key of actorHistory.keys()) {
    if (key.startsWith(`${guildId}:`)) actorHistory.delete(key);
  }
  for (const key of aiCooldowns.keys()) {
    if (key.startsWith(`${guildId}:`)) aiCooldowns.delete(key);
  }
}

export function isAntiNukeAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getAntiNukeAIModel() {
  return DEFAULT_MODEL;
}
