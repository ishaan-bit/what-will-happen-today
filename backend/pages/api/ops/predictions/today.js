/**
 * GET /api/ops/predictions/today
 * Returns today's stored predictions (or 404 if not generated).
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
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const redis = getRedis();
    const dateKey = req.query.date || getTodayKey();
    const cacheKey = `wwht:predictions:${dateKey}`;
    const raw = await redis.get(cacheKey);
    if (!raw) return res.status(404).json({ error: 'not_ready', dateKey });
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json({ ok: true, dateKey, data });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
