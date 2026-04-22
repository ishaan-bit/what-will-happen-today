/**
 * Generation core — calls Ollama to produce 4 fresh predictions
 * (one per category) and stores them in Upstash Redis.
 *
 * Kept independent from backend/ so this folder can be lifted into
 * a separate machine without pulling Next.js dependencies.
 *
 * Run standalone:  node generate.js [--force]
 */

import 'dotenv/config'; // harmless if env already populated by bootstrap
import { Redis } from '@upstash/redis';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/v1';
const OLLAMA_MODEL_DEFAULT = process.env.OLLAMA_MODEL || 'phi3';
const OLLAMA_NUM_GPU = parseInt(process.env.OLLAMA_NUM_GPU || '26', 10);
const OLLAMA_NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX || '8192', 10);
const REQUEST_TIMEOUT_MS = 600_000;

export const JOB_STATE = { cancelRequested: false };

const CATEGORIES = ['love', 'career', 'money', 'mood'];
const CATEGORY_CONTEXT = {
  love: 'relationships, attraction, communication, emotional dynamics, connection',
  career: 'work, focus, opportunity, visibility, momentum, professional dynamics',
  money: 'spending, earning, financial decisions, value, resources',
  mood: 'mental state, energy, emotional weather, resilience, inner clarity',
};

const SYSTEM_PROMPT = `You generate daily prediction content for a tarot/astrology-style mobile app called "What Will Happen Today".
Tone: sharp, predictive, slightly uncomfortable, screenshot-worthy. NOT generic motivation.
Framing: events that WILL happen today. Use "you will…", "someone will…", "you'll notice…".
Never say "may", "might", "could", "tends to". Predictions are stated, not suggested.
Never mention stars, planets, Mercury, or zodiac mechanics directly in the prediction body.`;

let _redis = null;
function getRedis() {
  if (!_redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set');
    }
    _redis = Redis.fromEnv();
  }
  return _redis;
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

async function ollamaChat({ messages, model, temperature = 0.85, maxTokens = 350 }) {
  const base = OLLAMA_API_URL.replace(/\/v1\/?$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || OLLAMA_MODEL_DEFAULT,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: OLLAMA_NUM_CTX,
          num_gpu: OLLAMA_NUM_GPU,
        },
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Ollama ${r.status}: ${text}`);
    }
    const data = await r.json();
    return data.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function generateForCategory(category, dateKey, model) {
  const prompt = `Generate today's prediction for the "${category}" category (${CATEGORY_CONTEXT[category]}).
Date context: ${dateKey}

Return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "id": "${category.charAt(0).toUpperCase()}_llm_${dateKey}",
  "teaser": "<predictive headline. Start with 'You will' or 'Someone will' or 'You'll notice'. Max 16 words.>",
  "full": "<2-3 short thought-like lines (use \\n between lines). Internal, real, specific. NOT essay tone.>",
  "punch": "<one emotionally sharp screenshot-worthy line. Slightly uncomfortable truth. Max 14 words.>",
  "action": "<sharp instruction for when it happens. Direct, not advisory. Max 18 words.>",
  "timing": "<experiential time anchor. e.g. 'You'll feel this shift later tonight.' Max 12 words.>",
  "shareSnippet": "<one-line shareable version of the teaser, no app name. Max 18 words.>"
}`;

  const content = await ollamaChat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    model,
  });
  if (!content) throw new Error(`Empty response for ${category}`);
  const cleaned = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Generate predictions for all four categories and store in Redis.
 * @param {{force?: boolean, model?: string}} opts
 */
export async function generateAll({ force = false, model } = {}) {
  JOB_STATE.cancelRequested = false;
  const redis = getRedis();
  const dateKey = getTodayKey();
  const cacheKey = `wwht:predictions:${dateKey}`;

  if (!force) {
    const existing = await redis.get(cacheKey);
    if (existing) {
      console.log(`[gen] ${dateKey} already cached. Pass --force to overwrite.`);
      return { dateKey, skipped: true, reason: 'already_cached' };
    }
  }

  console.log(`[gen] generating predictions for ${dateKey} via Ollama (${model || OLLAMA_MODEL_DEFAULT})…`);

  const results = {};
  const errors = {};

  for (const cat of CATEGORIES) {
    if (JOB_STATE.cancelRequested) {
      console.log('[gen] cancel requested — stopping.');
      break;
    }
    try {
      const t0 = Date.now();
      results[cat] = await generateForCategory(cat, dateKey, model);
      console.log(`[gen] ✓ ${cat} (${Date.now() - t0}ms): "${results[cat].teaser}"`);
    } catch (err) {
      console.error(`[gen] ✗ ${cat}: ${err.message}`);
      errors[cat] = err.message;
    }
  }

  if (Object.keys(results).length === 0) {
    throw new Error('All categories failed: ' + JSON.stringify(errors));
  }

  const payload = {
    dateKey,
    generatedAt: new Date().toISOString(),
    predictions: results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    model: model || OLLAMA_MODEL_DEFAULT,
  };

  await redis.set(cacheKey, JSON.stringify(payload), { ex: 36 * 60 * 60 });
  console.log(`[gen] stored ${Object.keys(results).length}/4 categories for ${dateKey}`);
  return payload;
}

// CLI runner
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const force = process.argv.includes('--force');
  generateAll({ force })
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
