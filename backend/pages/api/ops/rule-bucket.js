/**
 * POST /api/ops/rule-bucket/bump
 * Increments the global rule bucket so all clients re-pick their
 * rule-based prediction on next /api/predictions/daily call.
 *
 * GET /api/ops/rule-bucket
 * Returns current bucket value.
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
      const v = await redis.get('wwht:ruleBucket');
      return res.status(200).json({ ok: true, ruleBucket: v ? String(v) : '0' });
    }
    if (req.method === 'POST') {
      const next = await redis.incr('wwht:ruleBucket');
      return res.status(200).json({ ok: true, ruleBucket: String(next) });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
