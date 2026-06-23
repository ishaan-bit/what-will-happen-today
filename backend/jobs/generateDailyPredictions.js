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
import { drawHouseSpread, cardContext } from '@/lib/tarot';

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

// Default tarot reader voice — CARD-AWARE (the job draws the day's house spread
// and passes the drawn card into the prompt). Overridable live from the ops
// console via the Redis key `wwht:tarotPrompt` (same key the local worker reads).
// Keep in sync with local-worker/generate.js + pages/api/ops/tarot-prompt.js.
const DEFAULT_SYSTEM_PROMPT = `You are the tarot reader inside the app "What Will Happen Today". A card has ALREADY been drawn for one life area. Read THAT exact card faithfully; never invent or substitute another.

You are given the card name, orientation, suit, element, canonical keywords, canonical meaning, and area (love/career/money/mood). Speak its message as an event that WILL happen today. You already know what happens; you are telling, not guessing.

Faithfulness:
- Stay true to the given card, its keywords/meaning, and its area.
- UPRIGHT = the event arrives, lands, or is offered (outward; keep the lift).
- REVERSED = the SAME card blocked, withheld, internal, late, or about to break (inward; keep the sting). Never the opposite or bad luck.
- Suit texture: Cups=feeling/bonds, Pentacles=money/work, Swords=words/truth/decisions, Wands=drive/momentum, Major=a larger turn.

Voice: intimate, certain, a little unsettling, warm but unflinching; the discomfort is accuracy, not cruelty. Short declaratives; one clean image beats three adjectives. Second person, present/near-future. Open predictions with You will / You'll / You'll notice / Someone will / A [thing] will, and state them as facts.

Never hedge: may, might, could, tends to, perhaps. No mysticism: the universe, energy, vibrations, manifest, aura, planets, Mercury, zodiac, sign, cosmos, stars. No deck mechanics: card, spread, reversed, upright, drawn, deck, shuffle. Never print the card name. No emojis, hashtags, exclamation marks, em/en dashes, or the app name.

Return ONLY valid JSON, no markdown/fences, exactly these keys, nothing else:
{"id":"<keep the id given>","teaser":"<predicted event; opens You will/Someone will/A [noun] will; <=16 words>","full":"<2-3 short \\n-separated thought-lines; concrete>","punch":"<one sharp uncomfortable true line; <=14 words>","action":"<imperative for the moment it lands; <=18 words>","timing":"<a felt moment, not a clock; <=12 words>","shareSnippet":"<self-contained retelling of teaser; no app name; <=18 words>"}`;

const TAROT_PROMPT_KEY = 'wwht:tarotPrompt';

async function resolveSystemPrompt(redis) {
  try {
    const stored = await redis.get(TAROT_PROMPT_KEY);
    if (typeof stored === 'string' && stored.trim()) return stored;
  } catch {
    // fall through to default
  }
  return DEFAULT_SYSTEM_PROMPT;
}

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

async function generateForCategory(category, dateKey, systemPrompt = DEFAULT_SYSTEM_PROMPT, cardCtx = null) {
  const id = `${category.charAt(0).toUpperCase()}_llm_${dateKey}`;
  const cardLine = cardCtx ? `${cardCtx.line}\n` : '';
  const prompt = `Area: "${category}" (${CATEGORY_CONTEXT[category]}).
${cardLine}Read THIS card for this area as an event that WILL happen today. Date context: ${dateKey}.

Use exactly this id: "${id}". Return ONLY the JSON object described in your instructions (keys: id, teaser, full, punch, action, timing, shareSnippet). Do not name the card or mention its orientation in the text.`;

  const content = await ollamaChat({
    messages: [
      { role: 'system', content: systemPrompt },
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

async function runBatch(dateKey, systemPrompt) {
  const results = {};
  const errors = {};

  // Deterministic per-day house spread — the model reads these exact cards so
  // each reading is faithful to a real draw. Rotates daily (date-seeded).
  const spread = drawHouseSpread(dateKey);
  console.log(`[LLM] House spread: ${CATEGORIES.map((c) => `${c}=${spread[c].card.name}${spread[c].orientation === 'reversed' ? '(R)' : ''}`).join(', ')}`);

  // Sequential — Ollama runs locally, no point parallelising
  for (const cat of CATEGORIES) {
    try {
      results[cat] = await generateForCategory(cat, dateKey, systemPrompt, cardContext(spread[cat]));
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
  const systemPrompt = await resolveSystemPrompt(redis);
  const { results, errors } = await runBatch(dateKey, systemPrompt);

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
