/**
 * Public monetization config endpoint.
 * Mobile also receives this from /api/predictions/daily, but this endpoint is
 * useful for smoke tests and future clients.
 */
import { Redis } from '@upstash/redis';
import { normalizeMonetizationConfig } from '@/lib/monetization';
import { parseStoredJson } from '@/lib/heroPool';

const KEY = 'wwht:monetizationConfig';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const config = normalizeMonetizationConfig(parseStoredJson(await getRedis().get(KEY)) || {});
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    return res.status(200).json({ ok: true, config });
  } catch (err) {
    return res.status(200).json({ ok: true, config: normalizeMonetizationConfig({}), fallback: true });
  }
}
