/**
 * POST /api/ops/predictions/regenerate
 * Wipes today's cache so the next worker run regenerates fresh.
 * Auth: X-Ops-Key header.
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const redis = getRedis();
    const dateKey = req.body?.date || getTodayKey();
    const cacheKey = `wwht:predictions:${dateKey}`;
    await redis.del(cacheKey);
    return res.status(200).json({ ok: true, dateKey, cleared: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
