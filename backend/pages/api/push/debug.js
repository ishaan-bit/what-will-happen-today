/**
 * POST /api/push/debug
 * Public endpoint — mobile app posts each step of its push registration flow.
 * Stored as a capped Redis list (last 100). Lets us see WHY a device failed
 * to register without needing the device's logs.
 *
 * Body: { step: string, ok: boolean, info?: string, installId?: string,
 *         platform?: string, appVersion?: string }
 */
import { Redis } from '@upstash/redis';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const LOG_KEY = 'wwht:pushDebugLog';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const b = req.body || {};
    const entry = {
      at: new Date().toISOString(),
      step: (b.step || 'unknown').toString().slice(0, 32),
      ok: b.ok === true,
      info: (b.info || '').toString().slice(0, 240),
      installId: (b.installId || '').toString().slice(0, 64),
      platform: (b.platform || '').toString().slice(0, 16),
      appVersion: (b.appVersion || '').toString().slice(0, 32),
    };
    const redis = getRedis();
    await redis.lpush(LOG_KEY, JSON.stringify(entry));
    await redis.ltrim(LOG_KEY, 0, 99);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
