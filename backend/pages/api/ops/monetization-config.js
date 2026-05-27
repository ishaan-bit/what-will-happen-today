/**
 * Remote monetization config for app funnel tuning.
 *   GET  /api/ops/monetization-config
 *   POST /api/ops/monetization-config
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';
import { normalizeMonetizationConfig } from '@/lib/monetization';
import { parseStoredJson } from '@/lib/heroPool';

const KEY = 'wwht:monetizationConfig';

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
      const config = normalizeMonetizationConfig(parseStoredJson(await redis.get(KEY)) || {});
      return res.status(200).json({ ok: true, config });
    }

    if (req.method === 'POST') {
      const config = normalizeMonetizationConfig(req.body || {});
      const value = {
        ...config,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(KEY, JSON.stringify(value));
      return res.status(200).json({ ok: true, config: value });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
