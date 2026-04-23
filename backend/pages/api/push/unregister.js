/**
 * POST /api/push/unregister
 * Public endpoint - mobile app removes its Expo push token from the backend
 * (called when the user disables push notifications in Settings).
 *
 * Body: { token: string }
 */
import { Redis } from '@upstash/redis';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const TOKEN_SET_KEY = 'wwht:pushTokens';
const TOKEN_META_PREFIX = 'wwht:pushMeta:';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = req.body || {};
    const token = (body.token || '').toString().trim();
    if (!token) return res.status(400).json({ error: 'missing_token' });

    const redis = getRedis();
    await Promise.all([
      redis.srem(TOKEN_SET_KEY, token),
      redis.del(TOKEN_META_PREFIX + token),
    ]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[/api/push/unregister]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
