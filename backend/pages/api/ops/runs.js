/**
 * GET /api/ops/runs
 * Returns the most recent generation runs (success/failure per category)
 * so the ops console can surface LLM errors directly in the UI.
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
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const redis = getRedis();
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const items = await redis.lrange('wwht:runs', 0, limit - 1);
    const parsed = (items || []).map((it) => {
      try { return typeof it === 'string' ? JSON.parse(it) : it; }
      catch { return { raw: String(it) }; }
    });
    return res.status(200).json({ ok: true, runs: parsed });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
