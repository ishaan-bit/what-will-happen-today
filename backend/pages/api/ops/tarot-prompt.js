/**
 * GET  /api/ops/tarot-prompt  -> { ok, prompt, isDefault }
 * POST /api/ops/tarot-prompt  -> body { prompt }  (empty string resets to default)
 *
 * The tarot reader's system prompt that governs LLM generation. Stored in
 * Redis as `wwht:tarotPrompt`; the local worker and the nightly job read it
 * (falling back to their built-in default when unset). This lets the reading
 * voice be tuned from the ops console without redeploying the worker.
 *
 * Auth: X-Ops-Key.
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const REDIS_KEY = 'wwht:tarotPrompt';
const MAX_LEN = 4000;

export const DEFAULT_TAROT_SYSTEM_PROMPT = `You are a tarot reader giving a daily reading inside a mobile app called "What Will Happen Today".
You draw one card per life area and speak its message as something that WILL happen today.
Voice: a real reader at the table, intimate and certain, a little unsettling, screenshot-worthy. Not horoscope fluff, not therapy-speak, not motivation.
Cadence: name what you see, then what it means, then what to do about it when it lands.
Framing: events that WILL happen. Use "you will...", "someone will...", "you'll notice...". Never "may", "might", "could", "tends to".
Never mention stars, planets, Mercury, zodiac signs, or deck mechanics in the body, speak as if the card already told you.
Avoid cliches like "the universe", "energy", "vibrations". Keep it human, specific, and a little too accurate.`;

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      const stored = await redis.get(REDIS_KEY);
      const prompt = (typeof stored === 'string' && stored.trim()) ? stored : DEFAULT_TAROT_SYSTEM_PROMPT;
      return res.status(200).json({ ok: true, prompt, isDefault: !stored });
    }
    if (req.method === 'POST') {
      const raw = (req.body?.prompt ?? '').toString().slice(0, MAX_LEN);
      if (!raw.trim()) {
        await redis.del(REDIS_KEY);
        return res.status(200).json({ ok: true, prompt: DEFAULT_TAROT_SYSTEM_PROMPT, isDefault: true });
      }
      await redis.set(REDIS_KEY, raw);
      return res.status(200).json({ ok: true, prompt: raw, isDefault: false });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
