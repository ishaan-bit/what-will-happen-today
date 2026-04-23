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
      const [v, mode] = await Promise.all([
        redis.get('wwht:ruleBucket'),
        redis.get('wwht:engineMode'),
      ]);
      return res.status(200).json({
        ok: true,
        ruleBucket: v ? String(v) : '0',
        engineMode: mode === 'rule' ? 'rule' : 'llm',
      });
    }
    if (req.method === 'POST') {
      // Bumping the bucket implies the operator wants the rule engine to
      // become the active source. Flip mode to 'rule' atomically.
      const [next] = await Promise.all([
        redis.incr('wwht:ruleBucket'),
        redis.set('wwht:engineMode', 'rule'),
      ]);
      return res.status(200).json({
        ok: true,
        ruleBucket: String(next),
        engineMode: 'rule',
      });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
