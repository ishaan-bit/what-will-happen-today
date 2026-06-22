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

// Default tarot reader voice. Can be overridden live from the ops console
// (Redis key `wwht:tarotPrompt`) without redeploying this worker.
const DEFAULT_SYSTEM_PROMPT = `You are a tarot reader giving a daily reading inside a mobile app called "What Will Happen Today".
You draw one card per life area and speak its message as something that WILL happen today.
Voice: a real reader at the table, intimate and certain, a little unsettling, screenshot-worthy. Not horoscope fluff, not therapy-speak, not motivation.
Cadence: name what you see, then what it means, then what to do about it when it lands.
Framing: events that WILL happen. Use "you will...", "someone will...", "you'll notice...". Never "may", "might", "could", "tends to".
Never mention stars, planets, Mercury, zodiac signs, or deck mechanics in the body, speak as if the card already told you.
Avoid cliches like "the universe", "energy", "vibrations". Keep it human, specific, and a little too accurate.`;

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

async function generateForCategory(category, dateKey, model, variantIndex = 0, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
  const variantNonce = variantIndex > 0 ? `\nVariant token: v${variantIndex + 1}-${Math.random().toString(36).slice(2, 8)}. Make this reading substantively different from any prior variants for this card and date.` : '';
  const prompt = `Draw and read today's card for the "${category}" area of life (${CATEGORY_CONTEXT[category]}).
Speak the card's message as the reader. Date context: ${dateKey}${variantNonce}

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
        const out = await generateForCategory(cat, dateKey, model, v, systemPrompt);
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
