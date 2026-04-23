/**
 * GET /api/ops/push-debug → last 30 push registration step logs
 * Auth: X-Ops-Key
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const LOG_KEY = 'wwht:pushDebugLog';

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const items = await getRedis().lrange(LOG_KEY, 0, 29);
    const log = (items || []).map((it) => {
      try { return typeof it === 'string' ? JSON.parse(it) : it; }
      catch { return { raw: String(it) }; }
    });
    return res.status(200).json({ ok: true, log });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
