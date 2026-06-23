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
import { drawHouseSpread, cardContext } from './tarot.js';

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

// Default tarot reader voice — CARD-AWARE. The generator draws the day's house
// spread and passes the drawn card (name/orientation/suit/element/keywords/
// canonical meaning) so each reading is faithful to a real card. Overridable
// live from the ops console (Redis key `wwht:tarotPrompt`) without redeploying.
// Keep in sync with backend/jobs/generateDailyPredictions.js and
// backend/pages/api/ops/tarot-prompt.js. See docs/tarot-reading-guide.md.
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

async function ollamaChat({ messages, model, temperature = 0.85, maxTokens = 800 }) {
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

async function generateForCategory(category, dateKey, model, variantIndex = 0, systemPrompt = DEFAULT_SYSTEM_PROMPT, cardCtx = null) {
  const variantNonce = variantIndex > 0 ? `\nVariant token: v${variantIndex + 1}-${Math.random().toString(36).slice(2, 8)}. Make this reading substantively different from any prior variant for this card and date, while staying faithful to the SAME drawn card and orientation.` : '';
  const id = `${category.charAt(0).toUpperCase()}_llm_${dateKey}`;
  const cardLine = cardCtx ? `${cardCtx.line}\n` : '';
  const prompt = `Area: "${category}" (${CATEGORY_CONTEXT[category]}).
${cardLine}Read THIS card for this area as an event that WILL happen today. Date context: ${dateKey}.${variantNonce}

Use exactly this id: "${id}". Return ONLY the JSON object described in your instructions (keys: id, teaser, full, punch, action, timing, shareSnippet). Do not name the card or mention its orientation in the text.`;

  const content = await ollamaChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    model,
    temperature: variantIndex > 0 ? 0.95 : 0.85,
  });
  if (!content) throw new Error(`Empty response for ${category}`);
  const parsed = extractJsonObject(content);
  if (!parsed) {
    const head = content.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`No JSON object found in model output. Head: ${head}`);
  }
  return sanitizePrediction(parsed);
}

/**
 * Pull the first balanced JSON object out of arbitrary model output.
 * Handles markdown fences, trailing commentary, multiple objects, etc.
 * Falls back to closing any unfinished string + braces if the model got cut off.
 */
function extractJsonObject(raw) {
  if (!raw) return null;
  let text = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastBalancedEnd = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastBalancedEnd = i;
        const slice = text.slice(start, i + 1);
        try { return JSON.parse(slice); }
        catch {
          try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, '$1')); }
          catch { /* keep scanning */ }
        }
      }
    }
  }
  // Repair attempt: model got truncated mid-string or mid-object.
  // Close the open string (if any), then close any open braces.
  if (depth > 0 || inString) {
    let repaired = text.slice(start);
    // Trim trailing whitespace/junk
    repaired = repaired.replace(/[\s,]+$/, '');
    if (inString) repaired += '"';
    // Strip a trailing partial key like ', "action' or ', "action":'
    repaired = repaired.replace(/,\s*"[^"]*"\s*:?\s*$/, '');
    repaired = repaired.replace(/,\s*"[^"]*$/, '');
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    while ((repaired.match(/{/g) || []).length > (repaired.match(/}/g) || []).length) {
      repaired += '}';
    }
    try { return JSON.parse(repaired); } catch { /* fall through */ }
  }
  return null;
}

/** Strip em/en dashes and ensure required fields exist. */
function sanitizePrediction(p) {
  const out = { ...p };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'string') out[k] = stripDashes(out[k]);
  }
  return out;
}
function stripDashes(s) {
  return s
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/[\u2014\u2013]/g, '-');
}

/**
 * Generate predictions for all four categories and store in Redis.
 * @param {{force?: boolean, model?: string, variantCount?: number}} opts
 */
export async function generateAll({ force = false, model, variantCount = 1 } = {}) {
  JOB_STATE.cancelRequested = false;
  const redis = getRedis();
  const dateKey = getTodayKey();
  const cacheKey = `wwht:predictions:${dateKey}`;
  const variants = Math.max(1, Math.min(8, parseInt(variantCount, 10) || 1));
  const systemPrompt = await resolveSystemPrompt(redis);

  if (!force) {
    const existing = await redis.get(cacheKey);
    if (existing) {
      console.log(`[gen] ${dateKey} already cached. Pass force to overwrite.`);
      return { dateKey, skipped: true, reason: 'already_cached' };
    }
  }

  console.log(`[gen] generating predictions for ${dateKey} via Ollama (${model || OLLAMA_MODEL_DEFAULT}), variants per category=${variants}…`);

  // Deterministic per-day house spread — the LLM reads these exact cards so the
  // nightly readings are faithful to a real draw. Rotates daily (date-seeded).
  const spread = drawHouseSpread(dateKey);
  console.log(`[gen] house spread: ${CATEGORIES.map((c) => `${c}=${spread[c].card.name}${spread[c].orientation === 'reversed' ? '(R)' : ''}`).join(', ')}`);

  const results = {};
  const errors = {};
  const attempts = {};
  const startedAt = new Date().toISOString();

  for (const cat of CATEGORIES) {
    if (JOB_STATE.cancelRequested) {
      console.log('[gen] cancel requested — stopping.');
      break;
    }
    const variantList = [];
    const variantAttempts = [];
    for (let v = 0; v < variants; v++) {
      if (JOB_STATE.cancelRequested) break;
      const t0 = Date.now();
      try {
        const out = await generateForCategory(cat, dateKey, model, v, systemPrompt, cardContext(spread[cat]));
        // Force per-variant id uniqueness so the app can distinguish them.
        if (variants > 1) out.id = `${out.id || cat}_v${v + 1}`;
        variantList.push(out);
        variantAttempts.push({ ok: true, ms: Date.now() - t0, teaser: out.teaser });
        console.log(`[gen] ✓ ${cat} v${v + 1} (${Date.now() - t0}ms): "${out.teaser}"`);
      } catch (err) {
        variantAttempts.push({ ok: false, ms: Date.now() - t0, error: err.message });
        console.error(`[gen] ✗ ${cat} v${v + 1}: ${err.message}`);
      }
    }
    if (variantList.length > 0) {
      results[cat] = variants === 1 ? variantList[0] : variantList;
      attempts[cat] = { ok: true, variants: variantList.length, requested: variants, perVariant: variantAttempts };
    } else {
      errors[cat] = variantAttempts[variantAttempts.length - 1]?.error || 'all_variants_failed';
      attempts[cat] = { ok: false, variants: 0, requested: variants, perVariant: variantAttempts, error: errors[cat] };
    }
  }

  // Always write a run record so ops console can show success+failures
  const runRecord = {
    dateKey,
    startedAt,
    finishedAt: new Date().toISOString(),
    model: model || OLLAMA_MODEL_DEFAULT,
    variantCount: variants,
    attempts,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    successCount: Object.keys(results).length,
  };
  try {
    await redis.set(`wwht:lastRun:${dateKey}`, JSON.stringify(runRecord), { ex: 7 * 24 * 60 * 60 });
    // Also append to a rolling history list (last 50 runs)
    await redis.lpush('wwht:runs', JSON.stringify(runRecord));
    await redis.ltrim('wwht:runs', 0, 49);
  } catch (e) {
    console.warn('[gen] failed to write run record:', e.message);
  }

  if (Object.keys(results).length === 0) {
    throw new Error('All categories failed: ' + JSON.stringify(errors));
  }

  // Merge with any existing partial cache so a partial regen does not wipe good data
  let mergedPredictions = results;
  try {
    const existing = await redis.get(cacheKey);
    if (existing) {
      const prev = typeof existing === 'string' ? JSON.parse(existing) : existing;
      mergedPredictions = { ...(prev.predictions || {}), ...results };
    }
  } catch {}

  const payload = {
    dateKey,
    generatedAt: new Date().toISOString(),
    predictions: mergedPredictions,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    model: model || OLLAMA_MODEL_DEFAULT,
    variantCount: variants,
    source: 'llm',
  };

  await redis.set(cacheKey, JSON.stringify(payload), { ex: 36 * 60 * 60 });
  // A successful generation means LLM is the active source until ops bumps the rule bucket.
  try { await redis.set('wwht:engineMode', 'llm'); } catch {}
  console.log(`[gen] stored ${Object.keys(results).length}/4 categories for ${dateKey} (variants=${variants})`);
  return payload;
}

// CLI runner
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const force = process.argv.includes('--force');
  generateAll({ force })
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
