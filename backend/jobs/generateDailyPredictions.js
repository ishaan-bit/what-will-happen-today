/**
 * Nightly LLM Prediction Job
 *
 * Generates fresh, LLM-enhanced predictions for all four categories
 * and stores them in Redis for the next day.
 *
 * Uses local Ollama (same setup as TriggerMap) — run from your machine
 * via the cron trigger or: node jobs/generateDailyPredictions.js
 *
 * Environment requirements:
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   OLLAMA_API_URL   (default: http://localhost:11434/v1)
 *   OLLAMA_MODEL     (default: phi3)
 *   OLLAMA_NUM_GPU   (default: 26)
 *   OLLAMA_NUM_CTX   (default: 8192)
 */

import { Redis } from '@upstash/redis';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/v1';
const OLLAMA_MODEL   = process.env.OLLAMA_MODEL   || 'phi3';
const OLLAMA_NUM_GPU = parseInt(process.env.OLLAMA_NUM_GPU || '26', 10);
const OLLAMA_NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX || '8192', 10);
const REQUEST_TIMEOUT_MS = 600_000; // 10 min — same as TriggerMap

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const CATEGORIES = ['love', 'career', 'money', 'mood'];
const CONCURRENCY = 1; // sequential — Ollama is single-threaded on local GPU

const SYSTEM_PROMPT = `You generate daily prediction content for an astrology-style mobile app.
Tone: sharp, grounded, slightly mysterious. NOT mystical or spiritual. NOT generic motivation.
Framing: behavioral and psychological patterns, not astrology mechanics.
Output must feel personal and slightly uncanny — like a smart friend who knows you well.
Never mention stars, planets, Mercury, or zodiac mechanics.`;

const CATEGORY_CONTEXT = {
  love: 'relationships, attraction, communication, emotional dynamics, connection',
  career: 'work, focus, opportunity, visibility, momentum, professional dynamics',
  money: 'spending, earning, financial decisions, value, resources',
  mood: 'mental state, energy, emotional weather, resilience, inner clarity',
};

async function ollamaChat({ messages, temperature = 0.85, maxTokens = 300 }) {
  const nativeBase = OLLAMA_API_URL.replace(/\/v1\/?$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${nativeBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama ${response.status}: ${text}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function generateForCategory(category, dateKey) {
  const prompt = `Generate a daily prediction for the "${category}" category (${CATEGORY_CONTEXT[category]}).
Date context: ${dateKey}

Return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "id": "${category.charAt(0).toUpperCase()}_llm_${dateKey}",
  "teaser": "<one sharp hook sentence, max 15 words, present tense>",
  "full": "<2-3 sentences of depth. Behavioral and specific. Not vague.>",
  "action": "<one concrete actionable instruction for today, max 20 words>"
}`;

  const content = await ollamaChat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });

  if (!content) throw new Error(`Empty response for ${category}`);

  // Strip markdown fences if model adds them despite instructions
  const cleaned = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned);
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

async function runBatch(dateKey) {
  const results = {};
  const errors = {};

  // Sequential — Ollama runs locally, no point parallelising
  for (const cat of CATEGORIES) {
    try {
      results[cat] = await generateForCategory(cat, dateKey);
      console.log(`[LLM] Generated ${cat}: "${results[cat].teaser}"`);
    } catch (err) {
      console.error(`[LLM] Failed ${cat}:`, err.message);
      errors[cat] = err.message;
    }
  }

  return { results, errors };
}

export async function generateDailyPredictions() {
  const redis = getRedis();
  const dateKey = getTodayKey();
  const cacheKey = `wwht:predictions:${dateKey}`;

  // Skip if already generated for today
  const existing = await redis.get(cacheKey);
  if (existing) {
    console.log(`[LLM] Predictions for ${dateKey} already exist. Skipping.`);
    return existing;
  }

  console.log(`[LLM] Generating predictions for ${dateKey} via Ollama (${OLLAMA_MODEL})...`);
  const { results, errors } = await runBatch(dateKey);

  if (Object.keys(results).length === 0) {
    throw new Error('All LLM generations failed: ' + JSON.stringify(errors));
  }

  const payload = {
    dateKey,
    generatedAt: new Date().toISOString(),
    predictions: results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };

  // Expire at noon next day (36 hours)
  const ttlSeconds = 36 * 60 * 60;
  await redis.set(cacheKey, JSON.stringify(payload), { ex: ttlSeconds });

  console.log(`[LLM] Stored predictions for ${dateKey}. Categories: ${Object.keys(results).join(', ')}`);
  return payload;
}

// ─────────────────────────────────────────────────────────────
// Standalone runner  —  node jobs/generateDailyPredictions.js
// (same pattern as TriggerMap local-worker)
// ─────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  // Load .env when running directly (not via Next.js)
  const { config } = await import('dotenv');
  config({ path: new URL('../.env', import.meta.url).pathname });

  generateDailyPredictions()
    .then((result) => {
      console.log('[LLM] Done:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[LLM] Fatal:', err);
      process.exit(1);
    });
}
