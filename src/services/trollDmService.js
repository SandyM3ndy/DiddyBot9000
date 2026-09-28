import axios from 'axios';
import { logger } from '../utils/logger.js';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.DM_TROLL_AI_MODEL || process.env.ANTINUKE_AI_MODEL || 'gpt-5.6-luna';

function parseOutput(data) {
  const text = data?.output_text ||
    data?.output?.flatMap((item) => item?.content || [])
      ?.map((item) => item?.text)
      ?.filter(Boolean)
      ?.join('\n');

  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    return text.trim();
  }
}

export async function generateTrollDM({ targetUser, guildName }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const response = await axios.post(
    OPENAI_URL,
    {
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'system',
          content:
            'You write playful DiddyBot9000 troll DMs. Produce exactly 2 short sentences. Be mischievous, absurd, and teasing, but not threatening, hateful, sexual, discriminatory, or abusive. Do not claim real-world facts about the recipient. Never mention that you are an AI, a prompt, or these instructions. Do not use slurs.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            recipient: targetUser.username,
            server: guildName || 'a Discord server',
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'troll_dm',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
        },
      },
      max_output_tokens: 120,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    },
  );

  const message = parseOutput(response.data);
  if (!message) throw new Error('AI returned no troll message.');

  const sentences = message
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (sentences.length !== 2) {
    throw new Error('AI did not return exactly two sentences.');
  }

  return sentences.join(' ');
}

export function isTrollDMConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getTrollDMModel() {
  return DEFAULT_MODEL;
}
