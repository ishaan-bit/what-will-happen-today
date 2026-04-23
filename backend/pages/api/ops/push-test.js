/**
 * POST /api/ops/push-test
 * Ops-authenticated. Sets a Redis flag that tells all installed apps to run
 * a test push registration on their next poll.
 *
 * Body: { note?: string }
 * Returns: { ok: true, at: <iso> }
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '../../../lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const KEY = 'wwht:pushTestRequest';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireOpsAuth(req, res)) return;
  try {
    const at = Date.now();
    const payload = { at, note: (req.body?.note || '').toString().slice(0, 120) };
    const redis = getRedis();
    // 10 min TTL — request expires if no device picks it up
    await redis.set(KEY, JSON.stringify(payload), { ex: 600 });
    return res.status(200).json({ ok: true, at });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
