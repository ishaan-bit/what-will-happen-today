/**
 * GET /api/push/test-command
 * Public endpoint — mobile app polls this to see if an ops operator has
 * requested a test push registration. Returns { at } timestamp of the
 * current request (or 0 if none active). The app compares against its own
 * last-seen timestamp and triggers registration if newer.
 */
import { Redis } from '@upstash/redis';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const KEY = 'wwht:pushTestRequest';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const redis = getRedis();
    const raw = await redis.get(KEY);
    if (!raw) return res.status(200).json({ at: 0 });
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json({ at: parsed?.at || 0, note: parsed?.note || '' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
