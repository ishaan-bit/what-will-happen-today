/**
 * POST /api/push/register
 * Public endpoint — mobile app registers / refreshes its Expo push token.
 * Stores token in a Redis set + per-token metadata (platform, lastSeen).
 *
 * Body: { token: string, platform?: 'ios'|'android', appVersion?: string }
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
    if (!token || !token.startsWith('ExponentPushToken')) {
      return res.status(400).json({ error: 'invalid_token' });
    }

    const redis = getRedis();
    const meta = {
      token,
      platform: (body.platform || 'unknown').toString().slice(0, 16),
      appVersion: (body.appVersion || '').toString().slice(0, 32),
      lastSeenAt: new Date().toISOString(),
    };
    await Promise.all([
      redis.sadd(TOKEN_SET_KEY, token),
      redis.set(TOKEN_META_PREFIX + token, JSON.stringify(meta)),
    ]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[/api/push/register]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
