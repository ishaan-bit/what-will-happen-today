/**
 * GET  /api/ops/engine-mode    -> { ok, engineMode }
 * POST /api/ops/engine-mode    -> body { mode: 'llm' | 'rule' }
 *
 * Controls which prediction source the mobile app renders.
 *   'llm'  -> show LLM payload when present, fall back to rule per-category
 *   'rule' -> show rule-based picks only, ignore LLM payload entirely
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

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      const v = await redis.get('wwht:engineMode');
      return res.status(200).json({ ok: true, engineMode: v === 'rule' ? 'rule' : 'llm' });
    }
    if (req.method === 'POST') {
      const mode = (req.body?.mode || '').toString().toLowerCase();
      if (mode !== 'llm' && mode !== 'rule') {
        return res.status(400).json({ error: 'mode must be "llm" or "rule"' });
      }
      await redis.set('wwht:engineMode', mode);
      return res.status(200).json({ ok: true, engineMode: mode });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
